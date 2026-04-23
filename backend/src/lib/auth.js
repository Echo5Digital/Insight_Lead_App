const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');

const JWT_SECRET  = () => process.env.JWT_SECRET || 'change-me-in-production';
const COOKIE_NAME = 'il_token';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: '8h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET());
  } catch {
    return null;
  }
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
    path:     '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Reads JWT from HttpOnly cookie first, then Authorization header (for API clients)
async function requireAuth(req, res, next) {
  const cookieToken = req.cookies?.[COOKIE_NAME];
  const headerToken = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  const token       = cookieToken || headerToken;

  if (!token) return res.status(401).json({ error: 'No token' });

  const payload = verifyToken(token);
  if (!payload)  return res.status(401).json({ error: 'Invalid or expired token' });

  req.user = payload;
  next();
}

// Role guard — usage: requireRole('admin') or requireRole(['admin','staff'])
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  createToken, verifyToken,
  setAuthCookie, clearAuthCookie,
  requireAuth, requireRole,
  hashPassword, checkPassword,
};
