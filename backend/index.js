require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

const ingestLead    = require('./src/routes/ingest-lead');
const webhookLeads  = require('./src/routes/webhook');
const { login, logout, getMe }                          = require('./src/routes/auth');
const { getLeads, getLead, createLead, updateLead, convertLead, deleteLead } = require('./src/routes/leads');
const { getPatients, getPatient, createPatient, updatePatient, deletePatient, bulkDeletePatients, exportCsv } = require('./src/routes/patients');
const { getStats, getReferrals, getProcess, getAppointments, getTasks } = require('./src/routes/dashboard');
const { fetchSettings, saveSettings }   = require('./src/routes/settings');
const { getUsers, createUser, updateUser } = require('./src/routes/users');
const setup                             = require('./src/routes/setup');
const { requireAuth, requireRole }      = require('./src/lib/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin:      (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('CORS blocked'))),
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── WordPress plugin (legacy + new webhook) ───────────────────────────────────
app.post('/api/ingest/lead',    ingestLead);
app.post('/api/webhook/leads',  webhookLeads);

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login',  authLimiter, login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me',      requireAuth, getMe);

// ── One-time setup ────────────────────────────────────────────────────────────
app.post('/api/setup', setup);

// ── Leads ─────────────────────────────────────────────────────────────────────
app.get('/api/leads',              requireAuth,                              getLeads);
app.post('/api/leads',             requireAuth, requireRole(['admin','staff']), createLead);
app.get('/api/leads/:id',          requireAuth,                              getLead);
app.put('/api/leads/:id',          requireAuth, requireRole(['admin','staff']), updateLead);
app.post('/api/leads/:id/convert', requireAuth, requireRole(['admin','staff']), convertLead);
app.delete('/api/leads/:id',       requireAuth, requireRole('admin'),          deleteLead);

// ── Patients ──────────────────────────────────────────────────────────────────
app.get('/api/patients/export/csv',  requireAuth, requireRole('admin'),            exportCsv);
app.delete('/api/patients/bulk',     requireAuth, requireRole('admin'),            bulkDeletePatients);
app.get('/api/patients',             requireAuth,                                  getPatients);
app.post('/api/patients',            requireAuth, requireRole(['admin','staff']),   createPatient);
app.get('/api/patients/:id',         requireAuth,                                  getPatient);
app.put('/api/patients/:id',         requireAuth, requireRole(['admin','staff']),   updatePatient);
app.delete('/api/patients/:id',      requireAuth, requireRole('admin'),             deletePatient);

// ── Dashboard ─────────────────────────────────────────────────────────────────
app.get('/api/dashboard/stats',        requireAuth, getStats);
app.get('/api/dashboard/referrals',    requireAuth, getReferrals);
app.get('/api/dashboard/process',      requireAuth, getProcess);
app.get('/api/dashboard/appointments', requireAuth, getAppointments);
app.get('/api/dashboard/tasks',        requireAuth, getTasks);

// ── Settings ──────────────────────────────────────────────────────────────────
app.get('/api/settings', requireAuth,                       fetchSettings);
app.put('/api/settings', requireAuth, requireRole('admin'), saveSettings);

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users',     requireAuth, requireRole('admin'), getUsers);
app.post('/api/users',    requireAuth, requireRole('admin'), createUser);
app.put('/api/users/:id', requireAuth, requireRole('admin'), updateUser);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => console.log(`InsightLead API running on port ${PORT}`));
module.exports = app;
