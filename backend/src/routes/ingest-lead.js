const { getDb, verifyApiKey }                            = require('../lib/mongo');
const { encrypt, searchHash, nameSearchTokens }          = require('../lib/encryption');

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

    // Duplicate check using deterministic emailSearch hash (encrypted email is non-comparable)
    if (email) {
      const eHash = searchHash(email);
      const existing = await db.collection('leads').findOne({ tenantId, emailSearch: eHash });
      if (existing) {
        console.log('[LEAD] Duplicate skipped (emailSearch):', email);
        return res.status(200).json({ message: 'Duplicate skipped' });
      }
    }

    const firstName = (body.first_name || '').trim();
    const lastName  = (body.last_name  || '').trim();
    const notes     = (body.notes      || '').trim();

    const lead = {
      tenantId,
      firstName:    firstName ? encrypt(firstName) : undefined,
      lastName:     lastName  ? encrypt(lastName)  : undefined,
      email:        email     ? encrypt(email)      : undefined,
      phone:        phone     ? encrypt(phone)      : undefined,
      notes:        notes     ? encrypt(notes)      : undefined,
      // Search hashes for encrypted fields
      firstNameSearch: firstName ? searchHash(firstName) : undefined,
      lastNameSearch:  lastName  ? searchHash(lastName)  : undefined,
      nameTokens:      nameSearchTokens([firstName, lastName].filter(Boolean).join(' ')),
      emailSearch:     email     ? searchHash(email)     : undefined,
      phoneSearch:     phone     ? searchHash(phone)     : undefined,
      // Non-PHI fields stored in plaintext
      city:         (body.city        || '').trim(),
      source:       body.source       || body.utm_source || 'website',
      interest:     (body.interest    || '').trim(),
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

    console.log(`[LEAD] ${firstName} ${lastName} | formId:${lead.formId} | tenant:${tenantId}`);

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
