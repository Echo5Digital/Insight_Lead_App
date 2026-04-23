require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const ingestLead              = require('./src/routes/ingest-lead');
const { getLeads, getLead, updateLead, deleteLead, addActivity, requireAuth } = require('./src/routes/leads');
const { login, getProfile }   = require('./src/routes/auth');
const setup                   = require('./src/routes/setup');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'InsightLead API', ts: new Date().toISOString() });
});

// ── WordPress plugin → ingest leads ──────────────────────────────────────────
app.post('/api/ingest/lead', ingestLead);

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login',          login);
app.get('/api/auth/profile',         requireAuth, getProfile);

// ── Leads (JWT protected) ─────────────────────────────────────────────────────
app.get('/api/leads',                requireAuth, getLeads);
app.get('/api/leads/:id',            requireAuth, getLead);
app.put('/api/leads/:id',            requireAuth, updateLead);
app.delete('/api/leads/:id',         requireAuth, deleteLead);
app.post('/api/leads/:id/activity',  requireAuth, addActivity);

// ── One-time setup ────────────────────────────────────────────────────────────
app.post('/api/setup', setup);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`InsightLead API running on port ${PORT}`);
});

module.exports = app;
