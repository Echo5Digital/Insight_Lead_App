/**
 * One-time setup route: POST /api/setup
 * Creates the first tenant + admin user + API key.
 * Disable after first use by setting SETUP_DONE=true in env.
 */
const crypto             = require('crypto');
const { getDb }          = require('../lib/mongo');
const { hashPassword }   = require('../lib/auth');

module.exports = async function setup(req, res) {
  if (process.env.SETUP_DONE === 'true') {
    return res.status(403).json({ error: 'Setup already completed' });
  }

  try {
    const db = await getDb();

    const { adminEmail, adminPassword, tenantName } = req.body;
    if (!adminEmail || !adminPassword || !tenantName) {
      return res.status(400).json({ error: 'adminEmail, adminPassword, tenantName required' });
    }

    // Create tenant
    const tenantId = tenantName.toLowerCase().replace(/\s+/g, '-');
    await db.collection('tenants').updateOne(
      { _id: tenantId },
      { $setOnInsert: { _id: tenantId, name: tenantName, createdAt: new Date() } },
      { upsert: true }
    );

    // Create admin user
    const passwordHash = await hashPassword(adminPassword);
    await db.collection('users').updateOne(
      { email: adminEmail.toLowerCase() },
      { $setOnInsert: {
        email:        adminEmail.toLowerCase(),
        passwordHash,
        tenantId,
        role:         'admin',
        active:       true,
        createdAt:    new Date(),
      }},
      { upsert: true }
    );

    // Generate API key
    const rawKey  = 'il_' + crypto.randomBytes(24).toString('hex');
    const pepper  = process.env.IL_API_KEY_PEPPER || 'default-pepper';
    const keyHash = crypto.createHash('sha256').update(rawKey + pepper).digest('hex');

    await db.collection('api_keys').insertOne({
      tenantId,
      keyHash,
      name:      'Default WordPress Key',
      active:    true,
      createdAt: new Date(),
    });

    res.json({
      message:    'Setup complete!',
      tenantId,
      adminEmail: adminEmail.toLowerCase(),
      apiKey:     rawKey,
      note:       'Save the apiKey — it will not be shown again. Set SETUP_DONE=true in Vercel env vars.',
    });
  } catch (err) {
    console.error('[setup]', err);
    res.status(500).json({ error: 'Server error' });
  }
};
