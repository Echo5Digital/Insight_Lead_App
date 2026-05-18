const { getDb, ObjectId, writeAudit }              = require('../lib/mongo');
const { requireAuth, requireRole }                 = require('../lib/auth');
const { encrypt, decrypt, searchHash, nameSearchTokens } = require('../lib/encryption');

const PHI_ENCRYPT = ['name', 'firstName', 'lastName', 'phone', 'email', 'notes', 'insurance'];

function encryptLead(doc) {
  const out = { ...doc };
  PHI_ENCRYPT.forEach(f => { if (out[f] != null) out[f] = encrypt(out[f]); });
  if (doc.name      != null) out.nameTokens      = nameSearchTokens(doc.name);
  if (doc.firstName != null) out.firstNameSearch = searchHash(doc.firstName);
  if (doc.lastName  != null) out.lastNameSearch  = searchHash(doc.lastName);
  if (doc.email     != null) out.emailSearch     = searchHash(doc.email);
  if (doc.phone     != null) out.phoneSearch     = searchHash(doc.phone);
  return out;
}

function decryptLead(doc) {
  if (!doc) return doc;
  const out = { ...doc };
  PHI_ENCRYPT.forEach(f => { if (out[f] != null) out[f] = decrypt(out[f]); });
  return out;
}

// GET /api/leads
async function getLeads(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const filter   = { tenantId };

    if (req.query.status)         filter.status         = req.query.status;
    else if (req.query.hideArchived === 'true') filter.status = { $ne: 'Not Moving Forward' };
    if (req.query.source)         filter.source         = req.query.source;
    if (req.query.referralSource) filter.referralSource = req.query.referralSource;
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo)   filter.createdAt.$lte = new Date(req.query.dateTo);
    }
    if (req.query.search) {
      const term   = req.query.search.trim();
      const tokens = nameSearchTokens(term);
      const orClauses = [];
      if (tokens.length) orClauses.push({ nameTokens: { $in: tokens } });
      orClauses.push({ firstNameSearch: searchHash(term) });
      orClauses.push({ lastNameSearch:  searchHash(term) });
      orClauses.push({ emailSearch:     searchHash(term) });
      orClauses.push({ phoneSearch:     searchHash(term) });
      filter.$or = orClauses;
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 25);
    const skip  = (page - 1) * limit;

    const [leads, total] = await Promise.all([
      db.collection('leads').find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('leads').countDocuments(filter),
    ]);

    res.json({ leads: leads.map(decryptLead), total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[leads]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/leads/:id
async function getLead(req, res) {
  try {
    const db    = await getDb();
    const lead  = await db.collection('leads').findOne({ _id: new ObjectId(req.params.id), tenantId: req.user.tenantId });
    if (!lead) return res.status(404).json({ error: 'Not found' });

    const auditLog = await db.collection('audit_logs')
      .find({ entityId: req.params.id })
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    res.json({ lead: decryptLead(lead), auditLog });
  } catch (err) {
    console.error('[lead-detail]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/leads
async function createLead(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const allowed  = ['name', 'email', 'phone', 'dob', 'insurance', 'referralSource', 'notes', 'status', 'source'];
    const raw = { tenantId, convertedToPatient: false, source: 'manual', status: 'New', createdAt: new Date(), updatedAt: new Date() };
    allowed.forEach(f => { if (req.body[f]) raw[f] = req.body[f]; });
    const doc = encryptLead(raw);

    const result = await db.collection('leads').insertOne(doc);
    await writeAudit({ tenantId, userId: req.user.userId, userName: req.user.name || req.user.email, entityType: 'lead', entityId: result.insertedId.toString(), action: 'created' });
    res.status(201).json({ leadId: result.insertedId });
  } catch (err) {
    console.error('[create-lead]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/leads/:id
async function updateLead(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const allowed  = ['name', 'email', 'phone', 'dob', 'insurance', 'referralSource', 'notes', 'status'];
    const set      = { updatedAt: new Date() };
    allowed.forEach(f => { if (req.body[f] !== undefined) set[f] = req.body[f]; });

    // Get old values for audit (decrypt for human-readable comparison)
    const old         = await db.collection('leads').findOne({ _id: new ObjectId(req.params.id), tenantId });
    const decryptedOld = decryptLead(old);
    const changedFields = Object.keys(set)
      .filter(f => f !== 'updatedAt' && old && set[f] !== decryptedOld?.[f])
      .map(f => ({
        field:    f,
        oldValue: PHI_ENCRYPT.includes(f) ? '[PHI]' : decryptedOld?.[f],
        newValue: PHI_ENCRYPT.includes(f) ? '[PHI]' : set[f],
      }));

    // Encrypt PHI fields before writing
    PHI_ENCRYPT.forEach(f => { if (set[f] != null) set[f] = encrypt(set[f]); });
    if (req.body.name      != null) set.nameTokens      = nameSearchTokens(req.body.name);
    if (req.body.email     != null) set.emailSearch     = searchHash(req.body.email);
    if (req.body.phone     != null) set.phoneSearch     = searchHash(req.body.phone);
    if (req.body.insurance != null) set.insuranceSearch = searchHash(req.body.insurance);

    await db.collection('leads').updateOne({ _id: new ObjectId(req.params.id), tenantId }, { $set: set });

    await writeAudit({ tenantId, userId: req.user.userId, userName: req.user.name || req.user.email, entityType: 'lead', entityId: req.params.id, action: req.body.status ? 'status_changed' : 'updated', changedFields });
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('[update-lead]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/leads/:id/convert
async function convertLead(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const lead     = await db.collection('leads').findOne({ _id: new ObjectId(req.params.id), tenantId });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.convertedToPatient) return res.status(400).json({ error: 'Already converted' });

    // Decrypt lead PHI before building the patient record
    const dl   = decryptLead(lead);
    const body = req.body || {};

    const patientRaw = {
      tenantId,
      name:           dl.name || [dl.firstName, dl.lastName].filter(Boolean).join(' '),
      phone:          dl.phone          || '',
      email:          dl.email          || '',
      dob:            dl.dob            || null,
      insurance:      body.insurance      || dl.insurance      || '',
      referralSource: body.referralSource || dl.referralSource || dl.source || '',
      notes:          body.notes          || dl.notes          || '',
      status:         'In Progress',
      category:       body.category       || 'Standard',
      convertedFromLead: req.params.id,
      createdBy:      req.user.userId,
      lastModifiedBy: req.user.userId,
      formsCompleted: false,
      createdAt:      new Date(),
      updatedAt:      new Date(),
    };

    // Encrypt patient PHI before inserting
    const patPHI = ['name', 'phone', 'email', 'notes', 'insurance'];
    const patientDoc = { ...patientRaw };
    patPHI.forEach(f => { if (patientDoc[f] != null) patientDoc[f] = encrypt(patientDoc[f]); });
    if (patientRaw.name)      patientDoc.nameTokens      = nameSearchTokens(patientRaw.name);
    if (patientRaw.email)     patientDoc.emailSearch     = searchHash(patientRaw.email);
    if (patientRaw.phone)     patientDoc.phoneSearch     = searchHash(patientRaw.phone);
    if (patientRaw.insurance) patientDoc.insuranceSearch = searchHash(patientRaw.insurance);

    const patResult = await db.collection('patients').insertOne(patientDoc);
    await db.collection('leads').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { convertedToPatient: true, patientId: patResult.insertedId.toString(), status: 'Converted', updatedAt: new Date() } }
    );

    await writeAudit({ tenantId, userId: req.user.userId, userName: req.user.name || req.user.email, entityType: 'lead', entityId: req.params.id, action: 'converted', changedFields: [{ field: 'patientId', newValue: patResult.insertedId.toString() }] });
    res.json({ patientId: patResult.insertedId });
  } catch (err) {
    console.error('[convert-lead]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// DELETE /api/leads/:id
async function deleteLead(req, res) {
  try {
    const db = await getDb();
    await db.collection('leads').deleteOne({ _id: new ObjectId(req.params.id), tenantId: req.user.tenantId });
    await writeAudit({ tenantId: req.user.tenantId, userId: req.user.userId, userName: req.user.name || req.user.email, entityType: 'lead', entityId: req.params.id, action: 'deleted' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[delete-lead]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getLeads, getLead, createLead, updateLead, convertLead, deleteLead, requireAuth, requireRole };
