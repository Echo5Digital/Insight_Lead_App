const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = 3001;

// Change this to whatever API key you set in the WordPress plugin settings
const API_KEY = 'test-api-key-123';

// In-memory lead store (resets when server restarts — fine for testing)
const leads = [];
let leadCounter = 1;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'InsightLead test server is running', leads: leads.length });
});

// ─── Receive leads from WordPress plugin ─────────────────────────────────────
app.post('/api/ingest/lead', (req, res) => {
  const tenantKey = req.headers['x-tenant-key'];

  if (!tenantKey || tenantKey !== API_KEY) {
    console.log(`[REJECTED] Invalid API key: "${tenantKey}"`);
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const body = req.body || {};

  const lead = {
    id:          `lead_${String(leadCounter++).padStart(4, '0')}`,
    first_name:  body.first_name  || '',
    last_name:   body.last_name   || '',
    email:       body.email       || '',
    phone:       body.phone       || '',
    city:        body.city        || '',
    interest:    body.interest    || '',
    notes:       body.notes       || '',
    source:      body.source      || body.utm_source || 'website',
    utm_source:  body.utm_source  || '',
    utm_medium:  body.utm_medium  || '',
    utm_campaign:body.utm_campaign|| '',
    gclid:       body.gclid       || '',
    fbclid:      body.fbclid      || '',
    form_id:     body.form_id     || '',
    referrer:    body.referrer    || '',
    raw:         body,
    received_at: new Date().toISOString(),
  };

  leads.unshift(lead); // newest first

  console.log(`[LEAD #${lead.id}] ${lead.first_name} ${lead.last_name} <${lead.email}> | ${lead.phone} | form: ${lead.form_id}`);

  res.status(201).json({ leadId: lead.id, message: 'Lead received' });
});

// ─── Return all leads to the dashboard ───────────────────────────────────────
app.get('/api/leads', (req, res) => {
  res.json({ leads, total: leads.length });
});

// ─── Delete a single lead (for testing cleanup) ───────────────────────────────
app.delete('/api/leads/:id', (req, res) => {
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  leads.splice(idx, 1);
  res.json({ message: 'Deleted' });
});

// ─── Clear all leads ──────────────────────────────────────────────────────────
app.delete('/api/leads', (req, res) => {
  leads.length = 0;
  leadCounter  = 1;
  res.json({ message: 'All leads cleared' });
});

app.listen(PORT, () => {
  console.log('');
  console.log('  InsightLead Test Server');
  console.log('  ─────────────────────────────────────');
  console.log(`  Running at:  http://localhost:${PORT}`);
  console.log(`  Dashboard:   http://localhost:${PORT}`);
  console.log(`  API Key:     ${API_KEY}`);
  console.log('');
  console.log('  WordPress plugin settings:');
  console.log(`    API Endpoint URL: http://localhost:${PORT}`);
  console.log(`    API Key:          ${API_KEY}`);
  console.log('');
  console.log('  Waiting for leads...');
});
