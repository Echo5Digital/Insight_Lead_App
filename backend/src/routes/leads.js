const { getDb, ObjectId } = require('../lib/mongo');
const { requireAuth }     = require('../lib/auth');

// GET /api/leads
async function getLeads(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;

    const filter = { tenantId };
    if (req.query.stage)  filter.stage  = req.query.stage;
    if (req.query.source) filter.source = req.query.source;

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    const [leads, total] = await Promise.all([
      db.collection('leads')
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('leads').countDocuments(filter),
    ]);

    res.json({ leads, total, page, limit });
  } catch (err) {
    console.error('[leads]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/leads/:id
async function getLead(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;

    const lead = await db.collection('leads').findOne({
      _id: new ObjectId(req.params.id),
      tenantId,
    });

    if (!lead) return res.status(404).json({ error: 'Not found' });

    const activities = await db.collection('activities')
      .find({ leadId: lead._id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ lead, activities });
  } catch (err) {
    console.error('[lead-detail]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// PUT /api/leads/:id
async function updateLead(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;

    const allowed = ['stage', 'assignedUserId', 'notes', 'city', 'interest', 'firstName', 'lastName', 'phone', 'email'];
    const update  = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
    update.latestActivityAt = new Date();

    await db.collection('leads').updateOne(
      { _id: new ObjectId(req.params.id), tenantId },
      { $set: update }
    );

    if (req.body.stage) {
      await db.collection('activities').insertOne({
        tenantId,
        leadId:    new ObjectId(req.params.id),
        type:      'stage_change',
        content:   { stage: req.body.stage },
        createdBy: req.user.userId,
        createdAt: new Date(),
      });
    }

    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('[update-lead]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// DELETE /api/leads/:id
async function deleteLead(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    await db.collection('leads').deleteOne({ _id: new ObjectId(req.params.id), tenantId });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[delete-lead]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// POST /api/leads/:id/activity
async function addActivity(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const { type, content } = req.body;

    await db.collection('activities').insertOne({
      tenantId,
      leadId:    new ObjectId(req.params.id),
      type:      type || 'note',
      content,
      createdBy: req.user.userId,
      createdAt: new Date(),
    });

    await db.collection('leads').updateOne(
      { _id: new ObjectId(req.params.id), tenantId },
      { $set: { latestActivityAt: new Date() } }
    );

    res.status(201).json({ message: 'Activity added' });
  } catch (err) {
    console.error('[add-activity]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getLeads, getLead, updateLead, deleteLead, addActivity, requireAuth };
