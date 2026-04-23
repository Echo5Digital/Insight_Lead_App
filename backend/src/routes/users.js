const { getDb, ObjectId }          = require('../lib/mongo');
const { requireAuth, requireRole, hashPassword } = require('../lib/auth');

// GET /api/users  (admin only)
async function getUsers(req, res) {
  try {
    const db    = await getDb();
    const users = await db.collection('users')
      .find({ tenantId: req.user.tenantId })
      .project({ passwordHash: 0 })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ users });
  } catch (err) {
    console.error('[users]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/users  (admin only)
async function createUser(req, res) {
  try {
    const db = await getDb();
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password and role are required' });
    }
    if (!['admin', 'staff', 'readonly'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    const passwordHash = await hashPassword(password);
    const result = await db.collection('users').insertOne({
      name,
      email:      email.toLowerCase().trim(),
      passwordHash,
      role,
      tenantId:   req.user.tenantId,
      active:     true,
      createdAt:  new Date(),
      lastLogin:  null,
    });

    res.status(201).json({ userId: result.insertedId, message: 'User created' });
  } catch (err) {
    console.error('[create-user]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/users/:id  (admin only)
async function updateUser(req, res) {
  try {
    const db  = await getDb();
    const set = {};

    if (req.body.role !== undefined) {
      if (!['admin', 'staff', 'readonly'].includes(req.body.role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      set.role = req.body.role;
    }
    if (req.body.active !== undefined) set.active = Boolean(req.body.active);
    if (req.body.name   !== undefined) set.name   = req.body.name;

    if (req.body.password) {
      set.passwordHash = await hashPassword(req.body.password);
    }

    await db.collection('users').updateOne(
      { _id: new ObjectId(req.params.id), tenantId: req.user.tenantId },
      { $set: set }
    );

    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('[update-user]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getUsers, createUser, updateUser, requireAuth, requireRole };
