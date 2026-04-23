const crypto  = require('crypto');
const { getDb } = require('../lib/mongo');

// POST /api/webhook/leads  — WordPress plugin sends here
module.exports = async function webhookLeads(req, res) {
  try {
    // Validate X-Webhook-Secret using constant-time comparison
    const secret   = process.env.WEBHOOK_SECRET || '';
    const incoming = req.headers['x-webhook-secret'] || '';

    if (!secret) {
      console.warn('[webhook] WEBHOOK_SECRET not set — rejecting');
      return res.status(401).json({ success: false, error: 'Webhook not configured' });
    }

    const secretBuf   = Buffer.from(secret);
    const incomingBuf = Buffer.from(incoming);

    if (
      secretBuf.length !== incomingBuf.length ||
      !crypto.timingSafeEqual(secretBuf, incomingBuf)
    ) {
      console.warn('[webhook] Invalid secret from', req.ip);
      return res.status(401).json({ success: false, error: 'Invalid secret' });
    }

    // Look up tenant via API key (backwards-compat with existing plugin)
    const rawKey = req.headers['x-tenant-key'] || '';
    const db     = await getDb();

    let tenantId = null;
    if (rawKey) {
      const pepper  = process.env.IL_API_KEY_PEPPER || 'default-pepper';
      const keyHash = crypto.createHash('sha256').update(rawKey + pepper).digest('hex');
      const record  = await db.collection('api_keys').findOne({ keyHash, active: true });
      if (record) tenantId = record.tenantId;
    }

    // Fallback: use first active tenant if only one tenant exists
    if (!tenantId) {
      const tenant = await db.collection('tenants').findOne({});
      if (tenant) tenantId = tenant._id;
    }

    if (!tenantId) return res.status(400).json({ success: false, error: 'Cannot identify tenant' });

    const body  = req.body || {};
    const email = (body.email || '').toLowerCase().trim();
    const phone = (body.phone || '').trim();
    const name  = [body.first_name, body.last_name].filter(Boolean).join(' ').trim() ||
                  body.name || '';

    const leadDoc = {
      tenantId,
      name,
      firstName:    (body.first_name  || '').trim(),
      lastName:     (body.last_name   || '').trim(),
      email:        email   || undefined,
      phone:        phone   || undefined,
      insurance:    (body.insurance   || '').trim() || undefined,
      referralSource: (body.referral_source || body.utm_source || '').trim() || undefined,
      notes:        (body.notes       || '').trim() || undefined,
      source:       'WordPress',
      status:       'New',
      convertedToPatient: false,
      utmSource:    body.utm_source   || '',
      utmMedium:    body.utm_medium   || '',
      utmCampaign:  body.utm_campaign || '',
      gclid:        body.gclid        || '',
      fbclid:       body.fbclid       || '',
      referrer:     body.referrer     || '',
      formId:       body.form_id      || '',
      originalPayload: body,
      createdAt:    new Date(),
      updatedAt:    new Date(),
    };

    // Remove undefined keys
    Object.keys(leadDoc).forEach(k => leadDoc[k] === undefined && delete leadDoc[k]);

    const result = await db.collection('leads').insertOne(leadDoc);
    const leadId = result.insertedId.toString();

    console.log(`[WEBHOOK] Lead created: ${name} <${email || phone}> tenant:${tenantId}`);

    return res.status(200).json({ success: true, leadId });

  } catch (err) {
    if (err.code === 11000) {
      console.log('[WEBHOOK] Duplicate lead skipped');
      return res.status(200).json({ success: true, message: 'Duplicate skipped' });
    }
    console.error('[webhook]', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};
