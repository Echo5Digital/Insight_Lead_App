const { getDb, ObjectId, writeAudit } = require('../lib/mongo');
const { requireAuth, requireRole }    = require('../lib/auth');

// GET /api/leads
async function getLeads(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const filter   = { tenantId };

    if (req.query.status)         filter.status         = req.query.status;
    if (req.query.source)         filter.source         = req.query.source;
    if (req.query.referralSource) filter.referralSource = req.query.referralSource;
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo)   filter.createdAt.$lte = new Date(req.query.dateTo);
    }
    if (req.query.search) {
      const rx = new RegExp(req.query.search, 'i');
      filter.$or = [{ name: rx }, { email: rx }, { firstName: rx }, { lastName: rx }, { phone: rx }];
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 25);
    const skip  = (page - 1) * limit;

    const [leads, total] = await Promise.all([
      db.collection('leads').find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('leads').countDocuments(filter),
    ]);

    res.json({ leads, total, page, limit, pages: Math.ceil(total / limit) });
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

    res.json({ lead, auditLog });
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
    const doc      = { tenantId, convertedToPatient: false, source: 'manual', status: 'New', createdAt: new Date(), updatedAt: new Date() };
    allowed.forEach(f => { if (req.body[f]) doc[f] = req.body[f]; });

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

    // Get old values for audit
    const old = await db.collection('leads').findOne({ _id: new ObjectId(req.params.id), tenantId });
    await db.collection('leads').updateOne({ _id: new ObjectId(req.params.id), tenantId }, { $set: set });

    const changedFields = Object.keys(set)
      .filter(f => f !== 'updatedAt' && old && set[f] !== old[f])
      .map(f => ({ field: f, oldValue: old?.[f], newValue: set[f] }));

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

    const body = req.body || {};
    const patientDoc = {
      tenantId,
      name:           lead.name || [lead.firstName, lead.lastName].filter(Boolean).join(' '),
      phone:          lead.phone          || '',
      email:          lead.email          || '',
      dob:            lead.dob            || null,
      insurance:      body.insurance      || lead.insurance      || '',
      referralSource: body.referralSource || lead.referralSource || lead.source || '',
      notes:          body.notes          || lead.notes          || '',
      status:         'In Progress',
      category:       body.category       || 'Standard',
      convertedFromLead: req.params.id,
      createdBy:      req.user.userId,
      lastModifiedBy: req.user.userId,
      formsCompleted: false,
      createdAt:      new Date(),
      updatedAt:      new Date(),
    };

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
