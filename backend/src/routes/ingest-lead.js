const { getDb, verifyApiKey } = require('../lib/mongo');

module.exports = async function ingestLead(req, res) {
  try {
    // Auth via API key header
    const rawKey  = req.headers['x-tenant-key'];
    if (!rawKey) return res.status(401).json({ error: 'Missing API key' });

    const tenantId = await verifyApiKey(rawKey);
    if (!tenantId)  return res.status(401).json({ error: 'Invalid API key' });

    const body = req.body || {};

    // Normalize email
    const email = (body.email || '').toLowerCase().trim();
    const phone = (body.phone || '').trim();

    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone required' });
    }

    const db = await getDb();

    const lead = {
      tenantId,
      firstName:    (body.first_name  || '').trim(),
      lastName:     (body.last_name   || '').trim(),
      email:        email || undefined,
      phone:        phone || undefined,
      city:         (body.city        || '').trim(),
      source:       body.source       || body.utm_source || 'website',
      interest:     (body.interest    || '').trim(),
      notes:        (body.notes       || '').trim(),
      utmSource:    body.utm_source   || '',
      utmMedium:    body.utm_medium   || '',
      utmCampaign:  body.utm_campaign || '',
      utmTerm:      body.utm_term     || '',
      utmContent:   body.utm_content  || '',
      gclid:        body.gclid        || '',
      fbclid:       body.fbclid       || '',
      referrer:     body.referrer     || '',
      formId:       body.form_id      || '',
      stage:        'new',
      originalPayload: body,
      createdAt:    new Date(),
      latestActivityAt: new Date(),
    };

    // Remove undefined fields
    Object.keys(lead).forEach(k => lead[k] === undefined && delete lead[k]);

    const result = await db.collection('leads').insertOne(lead);
    const leadId = result.insertedId.toString();

    // Log activity
    await db.collection('activities').insertOne({
      tenantId,
      leadId: result.insertedId,
      type:   'created',
      content: { formId: body.form_id, source: lead.source },
      createdAt: new Date(),
    });

    console.log(`[LEAD] ${lead.firstName} ${lead.lastName} <${lead.email || lead.phone}> | ${lead.formId} | tenant: ${tenantId}`);

    return res.status(201).json({ leadId, message: 'Lead received' });

  } catch (err) {
    // Duplicate email — still return 200 so WordPress doesn't retry
    if (err.code === 11000) {
      console.log('[LEAD] Duplicate skipped:', err.keyValue);
      return res.status(200).json({ message: 'Duplicate skipped' });
    }
    console.error('[ingest-lead]', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
