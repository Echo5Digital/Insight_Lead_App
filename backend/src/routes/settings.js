const { getSettings, upsertSettings } = require('../lib/mongo');
const { requireAuth, requireRole }    = require('../lib/auth');

async function fetchSettings(req, res) {
  try {
    const settings = await getSettings(req.user.tenantId);
    res.json(settings);
  } catch (err) {
    console.error('[settings-get]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function saveSettings(req, res) {
  try {
    const allowed = ['appointmentDays', 'statusList', 'insuranceList', 'referralSourceList'];
    const patch   = {};
    allowed.forEach(k => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });
    await upsertSettings(req.user.tenantId, patch);
    res.json({ message: 'Saved' });
  } catch (err) {
    console.error('[settings-put]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { fetchSettings, saveSettings, requireAuth, requireRole };
