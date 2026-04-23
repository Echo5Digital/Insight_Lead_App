const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const { getDb } = require('./mongo');

const JWT_SECRET = () => process.env.JWT_SECRET || 'change-me-in-production';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: '24h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET());
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.replace('Bearer ', '').trim();

  if (!token) return res.status(401).json({ error: 'No token' });

  const payload = verifyToken(token);
  if (!payload)  return res.status(401).json({ error: 'Invalid token' });

  req.user = payload;
  next();
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { createToken, verifyToken, requireAuth, hashPassword, checkPassword };
