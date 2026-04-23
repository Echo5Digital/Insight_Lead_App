const { getDb }                          = require('../lib/mongo');
const { createToken, checkPassword, requireAuth } = require('../lib/auth');

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const db   = await getDb();
    const user = await db.collection('users').findOne({ email: email.toLowerCase().trim(), active: true });

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await checkPassword(password, user.passwordHash);
    if (!ok)  return res.status(401).json({ error: 'Invalid credentials' });

    const token = createToken({
      userId:   user._id.toString(),
      tenantId: user.tenantId,
      role:     user.role,
      email:    user.email,
    });

    res.json({ token, user: { id: user._id, email: user.email, role: user.role, tenantId: user.tenantId } });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/auth/profile
async function getProfile(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, getProfile, requireAuth };
