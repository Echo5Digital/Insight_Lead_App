const { MongoClient, ObjectId } = require('mongodb');

let client = null;
let db     = null;

async function getDb() {
  if (db) return db;

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'insightlead');

  // Helper: create index without crashing getDb() if it already exists or is incompatible
  const idx = (col, spec, opts) => col.createIndex(spec, opts || {}).catch(e =>
    console.log('[MongoDB] index note:', e.message)
  );

  // Leads
  const leads = db.collection('leads');
  await idx(leads, { tenantId: 1, createdAt: -1 });
  await idx(leads, { tenantId: 1, status: 1 });
  await idx(leads, { tenantId: 1, convertedToPatient: 1 });
  // Uniqueness now enforced via emailSearch hash (encrypted email is not directly comparable)
  await idx(leads, { tenantId: 1, emailSearch: 1 }, { unique: true, sparse: true });
  // Drop old email unique index if it exists (was incompatible with this MongoDB version)
  await leads.dropIndex('tenantId_1_email_1').catch(() => {});

  // Patients
  const patients = db.collection('patients');
  await idx(patients, { tenantId: 1, createdAt: -1 });
  await idx(patients, { tenantId: 1, status: 1 });
  await idx(patients, { tenantId: 1, category: 1 });
  await idx(patients, { tenantId: 1, intakeAppt: 1 });
  await idx(patients, { tenantId: 1, testAppt: 1 });
  await idx(patients, { tenantId: 1, feedbackAppt: 1 });
  await idx(patients, { tenantId: 1, referralDate: 1 });

  // Users
  const users = db.collection('users');
  await idx(users, { email: 1 }, { unique: true });
  await idx(users, { tenantId: 1 });

  // Audit log — append-only (HIPAA requirement)
  const audit = db.collection('audit_logs');
  await idx(audit, { tenantId: 1, timestamp: -1 });
  await idx(audit, { entityId: 1, entityType: 1 });

  // Apply schema validator to enforce required fields on every insert
  try {
    await db.command({
      collMod: 'audit_logs',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['tenantId', 'userId', 'action', 'timestamp'],
          properties: {
            tenantId:  { bsonType: 'string' },
            userId:    { bsonType: 'string' },
            action:    { bsonType: 'string' },
            timestamp: { bsonType: 'date' },
          },
        },
      },
      validationAction: 'error',
      validationLevel:  'strict',
    });
  } catch (e) {
    // Collection may not exist on first run — that is fine
    console.log('[MongoDB] audit_logs validator:', e.message);
  }

  // Wrap the audit collection in a Proxy that blocks any mutation other than insertOne
  const _rawAudit = db.collection('audit_logs');
  const BLOCKED_OPS = ['updateOne','updateMany','findOneAndUpdate','deleteOne','deleteMany','findOneAndDelete','replaceOne','drop'];
  db._auditCol = new Proxy(_rawAudit, {
    get(target, prop) {
      if (BLOCKED_OPS.includes(String(prop))) {
        return () => { throw new Error('[HIPAA] audit_logs is append-only — updates and deletes are forbidden'); };
      }
      return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop];
    },
  });

  // API keys
  await idx(db.collection('api_keys'), { keyHash: 1 });

  // Settings
  await idx(db.collection('settings'), { tenantId: 1 }, { unique: true });

  console.log('[MongoDB] Connected to', process.env.MONGODB_DB || 'insightlead');
  return db;
}

async function verifyApiKey(rawKey) {
  const database = await getDb();
  const crypto   = require('crypto');
  const pepper   = process.env.IL_API_KEY_PEPPER || 'default-pepper';
  const keyHash  = crypto.createHash('sha256').update(rawKey + pepper).digest('hex');

  const record = await database.collection('api_keys').findOneAndUpdate(
    { keyHash, active: true },
    { $set: { lastUsedAt: new Date() } }
  );

  return record ? record.tenantId : null;
}

// Write an audit log entry (append-only — HIPAA)
// Emails listed in AUDIT_EXCLUDE_EMAILS (.env, comma-separated) are never stored.
const _auditExcluded = new Set(
  (process.env.AUDIT_EXCLUDE_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
);
async function writeAudit({ tenantId, userId, userName, email, entityType, entityId, action, changedFields = [] }) {
  if (email && _auditExcluded.has(email.toLowerCase())) return;
  const database = await getDb();
  await database._auditCol.insertOne({
    tenantId,
    userId,
    userName,
    entityType,
    entityId,
    action,
    changedFields,
    timestamp: new Date(),
  });
}

const DEFAULT_SETTINGS = {
  appointmentDays: {
    intake:   7,
    test:     7,
    feedback: 7,
    gfeLookback: 100,
    outstandingLookback: 90,
  },
  statusList:        ['In Progress', 'Complete', 'Not Moving Forward', 'Waiting on Insurance', 'Waiting'],
  insuranceList: [
    'Aetna', 'Aetna Better', 'Ambetter', 'BCBS', 'BCBS/Medicaid', 'BCBS/SoonerCare',
    'BlueLinc', 'Cash Pay', 'Cigna', 'Healthcare Hwy', 'Healthchoice', 'Humana',
    'Humana Horizon', 'Kempton', 'Medicaid', 'Medicare/Medicaid', 'Ok Healthcare',
    'Okla Complete', 'Quantum', 'Sooner Select', 'SoonerCare', 'Tricare', 'UH',
    'UMR', 'United Health', 'Web-TPA',
  ],
  referralSourceList: [
    'ADHD Support Group', 'Arbuckle', 'Autism website', 'Call In', 'Call In (PSO)',
    'Choctaw Family', 'Deer Creek', 'Doctor', 'Dr Aaron', 'Dr George',
    'Dr Harris-OBGYN', 'Dr Jill Mays', 'Dr Matson', 'Dr Naidu', 'Dr Partridge',
    'Dr Phillips', 'Dr Tereas Rodriguez', 'Dr Whalen', 'Elite Therapy', 'Evolve',
    'META/FB', 'Flores Pediatrics', 'Friend', 'Google', 'Go Daddy', 'Integris',
    'Life Psych', 'Moore Family', 'NW Pediatrics', 'Oklahoma Pain Physicians',
    'Open Arms Foster', 'PC School', 'PCP', 'Pediatric Group', 'Perry Klaassen',
    'PSO', 'Psychiatric Wellness', 'Psychiatrist', 'Red Rock', 'Serenity',
    'Serenity Psych', 'Shines', 'Summit Health', 'Village Center Pedi', 'Website',
  ],
  doctorList: [],
  psychList: [],
};

async function getSettings(tenantId) {
  const database = await getDb();
  const doc = await database.collection('settings').findOne({ tenantId });

  const DEPRECATED_STATUSES = ['On Hold', 'Denied', 'No Response'];
  const REQUIRED_STATUSES   = ['Waiting on Insurance', 'Waiting'];

  if (doc) {
    let statusList = doc.statusList || DEFAULT_SETTINGS.statusList;
    // Strip deprecated statuses and ensure required ones exist
    statusList = statusList.filter(s => !DEPRECATED_STATUSES.includes(s));
    REQUIRED_STATUSES.forEach(s => { if (!statusList.includes(s)) statusList.push(s); });

    return {
      ...DEFAULT_SETTINGS,
      ...doc,
      statusList,
      appointmentDays: { ...DEFAULT_SETTINGS.appointmentDays, ...(doc.appointmentDays || {}) },
    };
  }
  return { tenantId, ...DEFAULT_SETTINGS };
}

async function upsertSettings(tenantId, patch) {
  const database = await getDb();
  await database.collection('settings').updateOne(
    { tenantId },
    { $set: { ...patch, tenantId, updatedAt: new Date() } },
    { upsert: true }
  );
}

module.exports = {
  getDb, ObjectId,
  verifyApiKey,
  writeAudit,
  getSettings, upsertSettings,
  DEFAULT_SETTINGS,
};
