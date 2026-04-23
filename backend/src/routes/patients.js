const { getDb, ObjectId, writeAudit } = require('../lib/mongo');
const { requireAuth, requireRole }    = require('../lib/auth');

function computeFields(doc) {
  // Rules 1-3: Math.floor, only when BOTH dates exist, otherwise explicit null
  const intakeAppt   = doc.intakeAppt   ? new Date(doc.intakeAppt)   : null;
  const testAppt     = doc.testAppt     ? new Date(doc.testAppt)     : null;
  const feedbackAppt = doc.feedbackAppt ? new Date(doc.feedbackAppt) : null;

  const out = {
    intakeToTestDays:     (intakeAppt && testAppt)     ? Math.floor((testAppt     - intakeAppt)   / 86400000) : null,
    testToFeedbackDays:   (testAppt && feedbackAppt)   ? Math.floor((feedbackAppt - testAppt)     / 86400000) : null,
    intakeToFeedbackDays: (intakeAppt && feedbackAppt) ? Math.floor((feedbackAppt - intakeAppt)   / 86400000) : null,
  };

  if (doc.referralDate) {
    const d    = new Date(doc.referralDate);
    const diff = d.getDay() === 0 ? 0 : 7 - d.getDay();
    out.referralWeekEnding = new Date(d.getTime() + diff * 86400000);
  }

  // Rule 5: formsCompleted = formsRec is filled (not just formsSent)
  out.formsCompleted = !!(doc.formsRec);
  return out;
}

const DATE_FIELDS   = ['dob','referralDate','referralRecDate','formsSent','formsRec','preAuthSent','preAuthRec','gfeSent','gfeRec','intakeAppt','testAppt','feedbackAppt'];
const NUMBER_FIELDS = ['copay','intakePaid','testingPaid','balance','intakePD','testPD','feedbackPD'];
const STRING_FIELDS = ['name','phone','email','insurance','referralSource','category','status','notes'];

function buildUpdate(body) {
  const set = {}, unset = {};
  STRING_FIELDS.forEach(f => { if (body[f] !== undefined) set[f] = body[f]; });
  DATE_FIELDS.forEach(f => {
    if (body[f] !== undefined) {
      if (!body[f]) { unset[f] = ''; }
      else {
        const d = new Date(body[f]);
        if (!isNaN(d.getTime())) set[f] = d;
      }
    }
  });
  NUMBER_FIELDS.forEach(f => {
    if (body[f] !== undefined) {
      const n = parseFloat(body[f]);
      set[f] = isNaN(n) ? null : n;
    }
  });
  // Merge set + unset-removed fields for computed fields
  const merged = { ...body };
  Object.keys(unset).forEach(k => delete merged[k]);
  Object.assign(set, computeFields({ ...merged, ...set }));
  return { set, unset };
}

// GET /api/patients
async function getPatients(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const filter   = { tenantId };

    if (req.query.status)         filter.status         = req.query.status;
    if (req.query.insurance)      filter.insurance      = req.query.insurance;
    if (req.query.referralSource) filter.referralSource = req.query.referralSource;
    if (req.query.category)       filter.category       = req.query.category;
    if (req.query.dateFrom || req.query.dateTo) {
      filter.referralDate = {};
      if (req.query.dateFrom) filter.referralDate.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo)   filter.referralDate.$lte = new Date(req.query.dateTo);
    }
    if (req.query.search) {
      const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    if (req.query.needsName === 'true') {
      filter.needsName = true;
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 25);
    const skip  = (page - 1) * limit;
    const sortField = req.query.sortBy  || 'createdAt';
    const sortDir   = req.query.sortDir === 'asc' ? 1 : -1;

    const [patients, total] = await Promise.all([
      db.collection('patients').find(filter).sort({ [sortField]: sortDir }).skip(skip).limit(limit).toArray(),
      db.collection('patients').countDocuments(filter),
    ]);

    res.json({ patients, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[patients]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/patients/export/csv
async function exportCsv(req, res) {
  try {
    const db       = await getDb();
    const patients = await db.collection('patients').find({ tenantId: req.user.tenantId }).sort({ createdAt: -1 }).toArray();

    const headers = ['Patient ID','Name','Phone','Email','DOB','Insurance','Referral Source','Category','Status',
      'Referral Date','Forms Sent','Forms Rec','Pre-Auth Sent','Pre-Auth Rec','GFE Sent','GFE Rec',
      'Intake Appt','Test Appt','Feedback Appt','Co-Pay','Intake Paid','Testing Paid','Balance',
      'Intake PD','Test PD','Feedback PD','Intake→Test Days','Test→Feedback Days','Intake→Feedback Days','Notes'];

    const d = (v) => v ? new Date(v).toLocaleDateString('en-US') : '';
    const n = (v) => (v != null) ? v : '';
    const s = (v) => v ? `"${String(v).replace(/"/g,'""')}"` : '';

    const rows = patients.map(p => [
      s(p.patientId), s(p.name), s(p.phone), s(p.email), d(p.dob), s(p.insurance), s(p.referralSource),
      s(p.category), s(p.status), d(p.referralDate), d(p.formsSent), d(p.formsRec),
      d(p.preAuthSent), d(p.preAuthRec), d(p.gfeSent), d(p.gfeRec),
      d(p.intakeAppt), d(p.testAppt), d(p.feedbackAppt),
      n(p.copay), n(p.intakePaid), n(p.testingPaid), n(p.balance),
      n(p.intakePD), n(p.testPD), n(p.feedbackPD),
      n(p.intakeToTestDays), n(p.testToFeedbackDays), n(p.intakeToFeedbackDays), s(p.notes),
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="patients.csv"');
    res.send(csv);
  } catch (err) {
    console.error('[export-csv]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/patients/:id
async function getPatient(req, res) {
  try {
    const db      = await getDb();
    const patient = await db.collection('patients').findOne({ _id: new ObjectId(req.params.id), tenantId: req.user.tenantId });
    if (!patient) return res.status(404).json({ error: 'Not found' });

    const auditLog = await db.collection('audit_logs')
      .find({ entityId: req.params.id })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    res.json({ patient, auditLog });
  } catch (err) {
    console.error('[patient-detail]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/patients
async function createPatient(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const { set }  = buildUpdate(req.body);
    const doc = { ...set, tenantId, createdBy: req.user.userId, lastModifiedBy: req.user.userId, createdAt: new Date(), updatedAt: new Date() };

    const result = await db.collection('patients').insertOne(doc);
    await writeAudit({ tenantId, userId: req.user.userId, userName: req.user.name || req.user.email, entityType: 'patient', entityId: result.insertedId.toString(), action: 'created' });
    res.status(201).json({ patientId: result.insertedId });
  } catch (err) {
    console.error('[create-patient]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/patients/:id
async function updatePatient(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const old      = await db.collection('patients').findOne({ _id: new ObjectId(req.params.id), tenantId });

    const { set, unset } = buildUpdate(req.body);
    set.updatedAt      = new Date();
    set.lastModifiedBy = req.user.userId;

    const mongoUpdate = { $set: set };
    if (Object.keys(unset).length) mongoUpdate.$unset = unset;

    await db.collection('patients').updateOne({ _id: new ObjectId(req.params.id), tenantId }, mongoUpdate);

    const changedFields = Object.keys(set)
      .filter(f => !['updatedAt','lastModifiedBy'].includes(f) && old && JSON.stringify(set[f]) !== JSON.stringify(old[f]))
      .map(f => ({ field: f, oldValue: old?.[f], newValue: set[f] }));

    await writeAudit({ tenantId, userId: req.user.userId, userName: req.user.name || req.user.email, entityType: 'patient', entityId: req.params.id, action: req.body.status ? 'status_changed' : 'updated', changedFields });
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('[update-patient]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// DELETE /api/patients/:id
async function deletePatient(req, res) {
  try {
    const db = await getDb();
    await db.collection('patients').deleteOne({ _id: new ObjectId(req.params.id), tenantId: req.user.tenantId });
    await writeAudit({ tenantId: req.user.tenantId, userId: req.user.userId, userName: req.user.name || req.user.email, entityType: 'patient', entityId: req.params.id, action: 'deleted' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[delete-patient]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// DELETE /api/patients/bulk
async function bulkDeletePatients(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const { ids }  = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });

    const objectIds = ids.map(id => new ObjectId(id));
    const result    = await db.collection('patients').deleteMany({ _id: { $in: objectIds }, tenantId });

    for (const id of ids) {
      await writeAudit({ tenantId, userId: req.user.userId, userName: req.user.name || req.user.email, entityType: 'patient', entityId: id, action: 'deleted' });
    }

    res.json({ deleted: result.deletedCount });
  } catch (err) {
    console.error('[bulk-delete]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getPatients, getPatient, createPatient, updatePatient, deletePatient,
  bulkDeletePatients, exportCsv, requireAuth, requireRole,
};
