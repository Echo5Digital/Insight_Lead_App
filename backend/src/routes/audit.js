const { getDb } = require('../lib/mongo');

// GET /api/audit
// Query params: page, limit, userName, action, entityType, dateFrom, dateTo
async function getAuditLogs(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const { userName, action, entityType, dateFrom, dateTo } = req.query;

    const filter = { tenantId };

    // Case-insensitive search on the userName field (stores name or email)
    if (userName) filter.userName = { $regex: userName.trim(), $options: 'i' };
    if (action)     filter.action     = action;
    if (entityType) filter.entityType = entityType;

    if (dateFrom || dateTo) {
      filter.timestamp = {};
      if (dateFrom) filter.timestamp.$gte = new Date(dateFrom);
      if (dateTo)   filter.timestamp.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const pageNum  = Math.max(1, parseInt(req.query.page)  || 1);
    const limitNum = Math.min(100, parseInt(req.query.limit) || 50);
    const skip     = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      db.collection('audit_logs').find(filter).sort({ timestamp: -1 }).skip(skip).limit(limitNum).toArray(),
      db.collection('audit_logs').countDocuments(filter),
    ]);

    res.json({ logs, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    console.error('[audit]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getAuditLogs };
