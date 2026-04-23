const { MongoClient, ObjectId } = require('mongodb');

let client = null;
let db     = null;

async function getDb() {
  if (db) return db;

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'insightlead');

  // Leads
  const leads = db.collection('leads');
  await leads.createIndex({ tenantId: 1, createdAt: -1 });
  await leads.createIndex({ tenantId: 1, status: 1 });
  await leads.createIndex({ tenantId: 1, convertedToPatient: 1 });
  await leads.createIndex(
    { tenantId: 1, email: 1 },
    { unique: true, partialFilterExpression: { email: { $exists: true, $ne: '' } } }
  );

  // Patients
  const patients = db.collection('patients');
  await patients.createIndex({ tenantId: 1, createdAt: -1 });
  await patients.createIndex({ tenantId: 1, status: 1 });
  await patients.createIndex({ tenantId: 1, category: 1 });
  await patients.createIndex({ tenantId: 1, intakeAppt: 1 });
  await patients.createIndex({ tenantId: 1, testAppt: 1 });
  await patients.createIndex({ tenantId: 1, feedbackAppt: 1 });
  await patients.createIndex({ tenantId: 1, referralDate: 1 });

  // Users
  const users = db.collection('users');
  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex({ tenantId: 1 });

  // Audit log
  const audit = db.collection('audit_logs');
  await audit.createIndex({ tenantId: 1, timestamp: -1 });
  await audit.createIndex({ entityId: 1, entityType: 1 });

  // API keys
  const apiKeys = db.collection('api_keys');
  await apiKeys.createIndex({ keyHash: 1 });

  // Settings
  await db.collection('settings').createIndex({ tenantId: 1 }, { unique: true });

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

// Write an audit log entry
async function writeAudit({ tenantId, userId, userName, entityType, entityId, action, changedFields = [] }) {
  const database = await getDb();
  await database.collection('audit_logs').insertOne({
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
  statusList:        ['In Progress', 'Complete', 'Not Moving Forward', 'On Hold', 'Denied', 'No Response'],
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
};

async function getSettings(tenantId) {
  const database = await getDb();
  const doc = await database.collection('settings').findOne({ tenantId });
  if (doc) {
    // Merge with defaults so new keys always exist
    return {
      ...DEFAULT_SETTINGS,
      ...doc,
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
