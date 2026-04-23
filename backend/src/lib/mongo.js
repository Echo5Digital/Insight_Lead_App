const { MongoClient, ObjectId } = require('mongodb');

let client = null;
let db     = null;

async function getDb() {
  if (db) return db;

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || 'insightlead');

  // Indexes
  const leads = db.collection('leads');
  await leads.createIndex({ tenantId: 1, createdAt: -1 });
  await leads.createIndex({ tenantId: 1, stage: 1 });
  await leads.createIndex(
    { tenantId: 1, email: 1 },
    { unique: true, partialFilterExpression: { email: { $exists: true, $ne: '' } } }
  );

  const apiKeys = db.collection('api_keys');
  await apiKeys.createIndex({ keyHash: 1 });

  console.log('[MongoDB] Connected to', process.env.MONGODB_DB || 'insightlead');
  return db;
}

async function verifyApiKey(rawKey) {
  const db      = await getDb();
  const crypto  = require('crypto');
  const pepper  = process.env.IL_API_KEY_PEPPER || 'default-pepper';
  const keyHash = crypto.createHash('sha256').update(rawKey + pepper).digest('hex');

  const record = await db.collection('api_keys').findOneAndUpdate(
    { keyHash, active: true },
    { $set: { lastUsedAt: new Date() } }
  );

  return record ? record.tenantId : null;
}

module.exports = { getDb, ObjectId, verifyApiKey };
