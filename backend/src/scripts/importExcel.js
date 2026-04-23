/**
 * One-time import: reads Patient Tracking Dashboard XLSM → MongoDB
 *
 * Usage:
 *   node src/scripts/importExcel.js
 *
 * What it does:
 *   1. Deletes all existing sample patients + leads for the tenant
 *   2. Reads Sheet 1  "Patient List"        → patients collection
 *   3. Reads Sheet 5  "Pain Management"     → marks matching patients category=Pain Management
 *   4. Reads Sheet 2  "Patients w/ No Response" → extra leads (not in patient list)
 *   5. Recalculates all cycle-time fields
 *   6. Reports totals
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const xlsx    = require('xlsx');
const path    = require('path');
const { MongoClient } = require('mongodb');

// ── Config ────────────────────────────────────────────────────────────────────
const EXCEL_FILE = path.join(__dirname, '../../../Patient Tracking Dashboard - Stahl Edits v3 (1) (1).xlsm');
const TENANT_ID  = 'insightfulmind-psych';   // set during setup

// ── Excel serial date → JS Date ───────────────────────────────────────────────
function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number' || serial < 1) return null;
  // Excel epoch starts Dec 30 1899; JS epoch Jan 1 1970
  // 25569 = days between the two epochs
  const ms = (serial - 25569) * 86400 * 1000;
  const d  = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') return excelDateToJS(val);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function toNum(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function toStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// ── Column letter → zero-based index ─────────────────────────────────────────
function colIndex(letter) {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

// ── Patient List column map (from header row 2) ───────────────────────────────
const COL_MAP = {
  patientId:      'E',
  name:           'F',
  phone:          'G',
  email:          'H',
  dob:            'I',
  insurance:      'J',
  referralSource: 'K',
  referralDate:   'L',
  formsSent:      'M',
  formsRec:       'N',
  preAuthSent:    'O',
  preAuthRec:     'P',
  gfeSent:        'Q',
  gfeRec:         'R',
  intakeAppt:     'S',
  testAppt:       'T',
  feedbackAppt:   'U',
  copay:          'V',
  intakePaid:     'W',
  testingPaid:    'X',
  balance:        'Y',
  notes:          'Z',
  intakePD:       'AA',
  testPD:         'AB',
  feedbackPD:     'AC',
  status:         'AD',
};

// ── Compute cycle-time fields (Rules 1-5) ─────────────────────────────────────
function computeFields(doc) {
  const intakeAppt   = doc.intakeAppt   || null;
  const testAppt     = doc.testAppt     || null;
  const feedbackAppt = doc.feedbackAppt || null;

  const out = {
    intakeToTestDays:     (intakeAppt && testAppt)     ? Math.floor((testAppt     - intakeAppt)   / 86400000) : null,
    testToFeedbackDays:   (testAppt && feedbackAppt)   ? Math.floor((feedbackAppt - testAppt)     / 86400000) : null,
    intakeToFeedbackDays: (intakeAppt && feedbackAppt) ? Math.floor((feedbackAppt - intakeAppt)   / 86400000) : null,
  };

  if (doc.referralDate) {
    const d    = doc.referralDate;
    const diff = d.getDay() === 0 ? 0 : 7 - d.getDay();
    out.referralWeekEnding = new Date(d.getTime() + diff * 86400000);
  }

  // Rule 5: formsCompleted = formsRec is filled
  out.formsCompleted = !!(doc.formsRec);
  return out;
}

// ── Get cell value from sheet ─────────────────────────────────────────────────
function cellVal(sheet, col, rowNum) {
  const addr = `${col}${rowNum}`;
  const cell = sheet[addr];
  if (!cell) return null;
  // Use formatted text for strings, raw value for numbers/dates
  if (cell.t === 's' || cell.t === 'str') return toStr(cell.v);
  return cell.v ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📂  Reading Excel file…');
  const wb = xlsx.readFile(EXCEL_FILE, {
    cellDates: false,   // keep serial numbers so we handle dates ourselves
    cellNF:    false,
    cellText:  false,
  });

  const sheetNames = wb.SheetNames;
  console.log('📋  Sheets found:', sheetNames.join(', '));

  const patientSheet   = wb.Sheets['Patient List'];
  const painSheet      = wb.Sheets['Pain Management'];
  const noRespSheet    = wb.Sheets['Patients with No Response'];

  if (!patientSheet) throw new Error('Could not find "Patient List" sheet');

  // ── Find last data row ────────────────────────────────────────────────────
  const range = xlsx.utils.decode_range(patientSheet['!ref'] || 'A1');
  const lastRow = range.e.r + 1; // 1-indexed

  console.log(`📊  Patient List: rows up to ${lastRow}`);

  // ── Build Pain Management name set ───────────────────────────────────────
  const painNames = new Set();
  if (painSheet) {
    const pr = xlsx.utils.decode_range(painSheet['!ref'] || 'A1');
    for (let r = 3; r <= pr.e.r + 1; r++) {
      const n = toStr(cellVal(painSheet, 'E', r) || cellVal(painSheet, 'F', r) || cellVal(painSheet, 'B', r));
      if (n) painNames.add(n.toLowerCase());
    }
    console.log(`🩺  Pain Management patients identified: ${painNames.size}`);
  }

  // ── Parse Patient List rows ───────────────────────────────────────────────
  const patients = [];
  let skipped = 0;

  for (let rowNum = 3; rowNum <= lastRow; rowNum++) {
    const name = toStr(cellVal(patientSheet, 'F', rowNum));
    if (!name) { skipped++; continue; }

    const doc = {
      tenantId:       TENANT_ID,
      patientId:      toStr(cellVal(patientSheet, 'E', rowNum)),
      name,
      phone:          toStr(cellVal(patientSheet, 'G', rowNum)),
      email:          toStr(cellVal(patientSheet, 'H', rowNum)).toLowerCase(),
      dob:            toDate(cellVal(patientSheet, 'I', rowNum)),
      insurance:      toStr(cellVal(patientSheet, 'J', rowNum)),
      referralSource: toStr(cellVal(patientSheet, 'K', rowNum)),
      referralDate:   toDate(cellVal(patientSheet, 'L', rowNum)),
      formsSent:      toDate(cellVal(patientSheet, 'M', rowNum)),
      formsRec:       toDate(cellVal(patientSheet, 'N', rowNum)),
      preAuthSent:    toDate(cellVal(patientSheet, 'O', rowNum)),
      preAuthRec:     toDate(cellVal(patientSheet, 'P', rowNum)),
      gfeSent:        toDate(cellVal(patientSheet, 'Q', rowNum)),
      gfeRec:         toDate(cellVal(patientSheet, 'R', rowNum)),
      intakeAppt:     toDate(cellVal(patientSheet, 'S', rowNum)),
      testAppt:       toDate(cellVal(patientSheet, 'T', rowNum)),
      feedbackAppt:   toDate(cellVal(patientSheet, 'U', rowNum)),
      copay:          toNum(cellVal(patientSheet, 'V', rowNum)),
      intakePaid:     toNum(cellVal(patientSheet, 'W', rowNum)),
      testingPaid:    toNum(cellVal(patientSheet, 'X', rowNum)),
      balance:        toNum(cellVal(patientSheet, 'Y', rowNum)),
      notes:          toStr(cellVal(patientSheet, 'Z', rowNum)),
      intakePD:       toNum(cellVal(patientSheet, 'AA', rowNum)),
      testPD:         toNum(cellVal(patientSheet, 'AB', rowNum)),
      feedbackPD:     toNum(cellVal(patientSheet, 'AC', rowNum)),
      status:         toStr(cellVal(patientSheet, 'AD', rowNum)) || 'In Progress',
      category:       painNames.has(name.toLowerCase()) ? 'Pain Management' : 'Standard',
      createdBy:      'excel-import',
      lastModifiedBy: 'excel-import',
      createdAt:      new Date(),
      updatedAt:      new Date(),
    };

    // Clean empty strings to undefined so MongoDB doesn't store them
    Object.keys(doc).forEach(k => {
      if (doc[k] === '' || doc[k] === null) delete doc[k];
    });

    // Auto-compute cycle times
    Object.assign(doc, computeFields(doc));

    patients.push(doc);
  }

  console.log(`✅  Parsed ${patients.length} patients (skipped ${skipped} empty rows)`);

  // ── Parse Pain Management sheet (separate patients not in Patient List) ─────
  const PM_SHEET_NAMES = new Set(['Patient List','Patients with No Response','Upcoming Appointments','Outstanding Tasks','Pain Management','Referral Dashboard','Process Dashboard','Settings']);
  if (painSheet) {
    const pr = xlsx.utils.decode_range(painSheet['!ref'] || 'A1');
    for (let r = 3; r <= pr.e.r + 1; r++) {
      const name = toStr(cellVal(painSheet, 'E', r));
      if (!name || PM_SHEET_NAMES.has(name)) continue;

      const formsSent  = toDate(cellVal(painSheet, 'K', r));
      const formsRec   = toDate(cellVal(painSheet, 'L', r));

      patients.push({
        tenantId:       TENANT_ID,
        name,
        email:          toStr(cellVal(painSheet, 'F', r)),
        dob:            toDate(cellVal(painSheet, 'G', r)),
        insurance:      toStr(cellVal(painSheet, 'H', r)),
        referralSource: toStr(cellVal(painSheet, 'I', r)),
        referralDate:   toDate(cellVal(painSheet, 'J', r)),
        formsSent,
        formsRec,
        preAuthSent:    toDate(cellVal(painSheet, 'M', r)),
        preAuthRec:     toDate(cellVal(painSheet, 'N', r)),
        intakeAppt:     toDate(cellVal(painSheet, 'O', r)),
        formsCompleted: !!(formsSent && formsRec),
        category:       'Pain Management',
        status:         'In Progress',
        createdBy:      'excel-import',
        lastModifiedBy: 'excel-import',
        createdAt:      new Date(),
        updatedAt:      new Date(),
      });
    }
    console.log(`🩺  Pain Management patients to import: ${patients.filter(p => p.category === 'Pain Management').length}`);
  }

  // ── Parse No Response sheet as Leads ──────────────────────────────────────
  const existingNames = new Set(patients.map(p => p.name?.toLowerCase()));
  const leads = [];

  if (noRespSheet) {
    const nr = xlsx.utils.decode_range(noRespSheet['!ref'] || 'A1');
    for (let r = 6; r <= nr.e.r + 1; r++) {
      const name = toStr(cellVal(noRespSheet, 'B', r) || cellVal(noRespSheet, 'E', r));
      if (!name || existingNames.has(name.toLowerCase())) continue;

      leads.push({
        tenantId:   TENANT_ID,
        name,
        phone:      toStr(cellVal(noRespSheet, 'F', r)),
        status:     'No Response',
        source:     'Excel Import',
        convertedToPatient: false,
        createdAt:  toDate(cellVal(noRespSheet, 'F', r)) || new Date(),
        updatedAt:  new Date(),
      });
    }
    console.log(`📋  Parsed ${leads.length} additional leads from No Response sheet`);
  }

  // ── Connect to MongoDB ────────────────────────────────────────────────────
  console.log('\n🔌  Connecting to MongoDB…');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'insightlead');
  console.log('✅  Connected');

  // ── Wipe existing sample data ─────────────────────────────────────────────
  console.log('\n🗑   Removing existing sample data…');
  const delP = await db.collection('patients').deleteMany({ tenantId: TENANT_ID });
  const delL = await db.collection('leads').deleteMany({
    tenantId: TENANT_ID,
    source: { $in: ['manual', 'WordPress', 'Excel Import'] },
    convertedToPatient: false,
  });
  console.log(`   Removed ${delP.deletedCount} patients, ${delL.deletedCount} leads`);

  // ── Insert patients ───────────────────────────────────────────────────────
  console.log(`\n📥  Inserting ${patients.length} patients…`);
  if (patients.length > 0) {
    const result = await db.collection('patients').insertMany(patients, { ordered: false });
    console.log(`✅  Inserted ${result.insertedCount} patients`);
  }

  // ── Insert leads ──────────────────────────────────────────────────────────
  if (leads.length > 0) {
    console.log(`📥  Inserting ${leads.length} leads…`);
    const result = await db.collection('leads').insertMany(leads, { ordered: false });
    console.log(`✅  Inserted ${result.insertedCount} leads`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalP = await db.collection('patients').countDocuments({ tenantId: TENANT_ID });
  const totalL = await db.collection('leads').countDocuments({ tenantId: TENANT_ID });

  console.log('\n─────────────────────────────────────');
  console.log('🎉  Import complete!');
  console.log(`   Total patients in DB : ${totalP}`);
  console.log(`   Total leads in DB    : ${totalL}`);

  // Quick stats
  const statusCounts = await db.collection('patients').aggregate([
    { $match: { tenantId: TENANT_ID } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();
  console.log('\n   Patient status breakdown:');
  statusCounts.forEach(s => console.log(`     ${s._id || 'No status'}: ${s.count}`));

  await client.close();
  console.log('\n✅  Done. Restart the backend to see the data.\n');
}

main().catch(err => {
  console.error('\n❌  Import failed:', err.message);
  process.exit(1);
});
