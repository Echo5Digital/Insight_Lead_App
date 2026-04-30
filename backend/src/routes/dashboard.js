const { getDb, getSettings } = require('../lib/mongo');
const { requireAuth }        = require('../lib/auth');

// GET /api/dashboard/stats
async function getStats(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;

    const [
      totalLeads, totalPatients,
      activePatients, completePatients, deniedPatients,
      convertedLeads,
      formsComplete,
    ] = await Promise.all([
      db.collection('leads').countDocuments({ tenantId }),
      db.collection('patients').countDocuments({ tenantId }),
      db.collection('patients').countDocuments({ tenantId, status: 'In Progress' }),
      db.collection('patients').countDocuments({ tenantId, status: 'Complete' }),
      db.collection('patients').countDocuments({ tenantId, status: { $in: ['Denied', 'Not Moving Forward'] } }),
      db.collection('leads').countDocuments({ tenantId, convertedToPatient: true }),
      db.collection('patients').countDocuments({ tenantId, formsCompleted: true }),
    ]);

    const conversionRate = totalLeads > 0
      ? Math.round((convertedLeads / totalLeads) * 100)
      : 0;

    const formsRate = totalPatients > 0
      ? Math.round((formsComplete / totalPatients) * 100)
      : 0;

    // Avg intake→feedback all time
    const pipeline = [
      { $match: { tenantId, intakeAppt: { $exists: true }, feedbackAppt: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$intakeToFeedbackDays' } } },
    ];
    const avgResult = await db.collection('patients').aggregate(pipeline).toArray();
    const avgDays   = avgResult[0] ? Math.round(avgResult[0].avg) : null;

    // Recent activity (last 15)
    const recentActivity = await db.collection('audit_logs')
      .find({ tenantId })
      .sort({ timestamp: -1 })
      .limit(15)
      .toArray();

    res.json({
      totalLeads, totalPatients,
      activePatients, completePatients, deniedPatients,
      conversionRate, formsRate,
      avgIntakeToFeedbackDays: avgDays,
      recentActivity,
    });
  } catch (err) {
    console.error('[stats]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/dashboard/referrals
async function getReferrals(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;

    const pipeline = [
      { $match: { tenantId, referralDate: { $exists: true } } },
      {
        $group: {
          _id: {
            source: '$referralSource',
            year:   { $year: '$referralDate' },
            month:  { $month: '$referralDate' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ];

    const data = await db.collection('patients').aggregate(pipeline).toArray();

    // Also get lead referrals
    const leadPipeline = [
      { $match: { tenantId, createdAt: { $exists: true } } },
      {
        $group: {
          _id: {
            source: '$referralSource',
            year:   { $year: '$createdAt' },
            month:  { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ];
    const leadData = await db.collection('leads').aggregate(leadPipeline).toArray();

    res.json({ patients: data, leads: leadData });
  } catch (err) {
    console.error('[referrals]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/dashboard/process
async function getProcess(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;

    // Reference = MAX referralDate in the collection
    const latestReferral = await db.collection('patients')
      .find({ tenantId, referralDate: { $exists: true, $ne: null } })
      .sort({ referralDate: -1 })
      .limit(1)
      .project({ referralDate: 1 })
      .toArray();

    const refDate = latestReferral[0]?.referralDate
      ? new Date(latestReferral[0].referralDate)
      : new Date();

    const last30Start = new Date(refDate);
    last30Start.setDate(last30Start.getDate() - 30);

    const last60Start = new Date(refDate);
    last60Start.setDate(last60Start.getDate() - 60);

    const ytdStart = new Date(refDate.getFullYear(), 0, 1);

    const r1 = (v) => v != null ? Math.round(v * 10) / 10 : null;

    async function getMetrics(windowStart) {
      // Filter by referralDate window
      const baseMatch = {
        tenantId,
        referralDate: { $exists: true, $ne: null, $gte: windowStart, $lte: refDate },
      };

      // Averages: only include values > 0 and < 400 (exclude data entry errors)
      const validI2T = { ...baseMatch, intakeToTestDays:     { $gt: 0, $lt: 400 } };
      const validT2F = { ...baseMatch, testToFeedbackDays:   { $gt: 0, $lt: 400 } };
      const validI2F = { ...baseMatch, intakeToFeedbackDays: { $gt: 0, $lt: 400 } };

      const [i2t, t2f, i2f, totalCount, formsCount] = await Promise.all([
        db.collection('patients').aggregate([
          { $match: validI2T },
          { $group: { _id: null, avg: { $avg: '$intakeToTestDays' } } },
        ]).toArray(),
        db.collection('patients').aggregate([
          { $match: validT2F },
          { $group: { _id: null, avg: { $avg: '$testToFeedbackDays' } } },
        ]).toArray(),
        db.collection('patients').aggregate([
          { $match: validI2F },
          { $group: { _id: null, avg: { $avg: '$intakeToFeedbackDays' } } },
        ]).toArray(),
        // Denominator: ALL patients referred in window
        db.collection('patients').countDocuments(baseMatch),
        // Numerator: patients where formsRec is not null
        db.collection('patients').countDocuments({
          ...baseMatch,
          formsRec: { $exists: true, $ne: null },
        }),
      ]);

      return {
        avgIntakeToTest:     i2t[0] ? r1(i2t[0].avg) : null,
        avgTestToFeedback:   t2f[0] ? r1(t2f[0].avg) : null,
        avgIntakeToFeedback: i2f[0] ? r1(i2f[0].avg) : null,
        formsCompletionPct:  totalCount > 0
          ? Math.round((formsCount / totalCount) * 1000) / 10
          : 0,
      };
    }

    // Monthly trend (MongoDB $avg ignores null natively)
    const monthlyPipeline = [
      { $match: { tenantId, testAppt: { $exists: true, $ne: null } } },
      {
        $group: {
          _id:    { year: { $year: '$testAppt' }, month: { $month: '$testAppt' } },
          avgI2T: { $avg: '$intakeToTestDays' },
          avgT2F: { $avg: '$testToFeedbackDays' },
          avgI2F: { $avg: '$intakeToFeedbackDays' },
          count:  { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ];
    const monthly = await db.collection('patients').aggregate(monthlyPipeline).toArray();

    const [last30, last60, ytd] = await Promise.all([
      getMetrics(last30Start),
      getMetrics(last60Start),
      getMetrics(ytdStart),
    ]);

    res.json({ last30, last60, ytd, monthly, refDate });
  } catch (err) {
    console.error('[process]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/dashboard/appointments
async function getAppointments(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const settings = await getSettings(tenantId);
    const cfg      = settings.appointmentDays;

    const now    = new Date();
    const future = days => new Date(now.getTime() + days * 86400000);
    const past   = days => new Date(now.getTime() - days * 86400000);

    const [intake, test, feedback, gfe] = await Promise.all([
      db.collection('patients').find({
        tenantId,
        intakeAppt: { $gte: now, $lte: future(cfg.intake) },
      }).sort({ intakeAppt: 1 }).toArray(),
      db.collection('patients').find({
        tenantId,
        testAppt: { $gte: now, $lte: future(cfg.test) },
      }).sort({ testAppt: 1 }).toArray(),
      db.collection('patients').find({
        tenantId,
        feedbackAppt: { $gte: now, $lte: future(cfg.feedback) },
      }).sort({ feedbackAppt: 1 }).toArray(),
      db.collection('patients').find({
        tenantId,
        gfeSent: { $gte: past(cfg.gfeLookback), $lte: now },
      }).sort({ gfeSent: -1 }).toArray(),
    ]);

    res.json({ intake, test, feedback, gfe, config: cfg });
  } catch (err) {
    console.error('[appointments]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/dashboard/tasks
async function getTasks(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;

    const [missingIntake, missingTest, missingFeedback] = await Promise.all([
      db.collection('patients').find({
        tenantId,
        formsSent:  { $exists: true, $ne: null },
        intakeAppt: { $exists: false },
      }).sort({ createdAt: -1 }).toArray(),
      db.collection('patients').find({
        tenantId,
        intakeAppt: { $exists: true, $ne: null },
        testAppt:   { $exists: false },
      }).sort({ intakeAppt: 1 }).toArray(),
      db.collection('patients').find({
        tenantId,
        testAppt:     { $exists: true, $ne: null },
        feedbackAppt: { $exists: false },
      }).sort({ testAppt: 1 }).toArray(),
    ]);

    res.json({ missingIntake, missingTest, missingFeedback });
  } catch (err) {
    console.error('[tasks]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/dashboard/new-patients?dateFrom=&dateTo=
async function getNewPatients(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const { dateFrom, dateTo } = req.query;

    const match = { tenantId };
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   match.createdAt.$lte = new Date(new Date(dateTo).setHours(23,59,59,999));
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
            day:   { $dayOfMonth: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ];

    const data = await db.collection('patients').aggregate(pipeline).toArray();
    res.json({ data });
  } catch (err) {
    console.error('[new-patients]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/dashboard/forms-stats?dateFrom=&dateTo=
async function getFormsStats(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const { dateFrom, dateTo } = req.query;

    const match = { tenantId };
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   match.createdAt.$lte = new Date(new Date(dateTo).setHours(23,59,59,999));
    }

    const [total, formsSentCount, formsRecCount, apptSetCount] = await Promise.all([
      db.collection('patients').countDocuments(match),
      db.collection('patients').countDocuments({ ...match, formsSent: { $exists: true, $ne: null } }),
      db.collection('patients').countDocuments({ ...match, formsRec:  { $exists: true, $ne: null } }),
      db.collection('patients').countDocuments({ ...match, $or: [
        { intakeAppt:    { $exists: true, $ne: null } },
        { testAppt:      { $exists: true, $ne: null } },
        { feedbackAppt:  { $exists: true, $ne: null } },
      ]}),
    ]);

    const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

    res.json({
      total,
      formsSentPct:  pct(formsSentCount),
      formsRecPct:   pct(formsRecCount),
      apptSetPct:    pct(apptSetCount),
      formsSentCount,
      formsRecCount,
      apptSetCount,
    });
  } catch (err) {
    console.error('[forms-stats]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/dashboard/status-breakdown?dateFrom=&dateTo=
async function getStatusBreakdown(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const { dateFrom, dateTo } = req.query;

    const match = { tenantId };
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   match.createdAt.$lte = new Date(new Date(dateTo).setHours(23,59,59,999));
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id:   '$status',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ];

    const data = await db.collection('patients').aggregate(pipeline).toArray();
    res.json({ data });
  } catch (err) {
    console.error('[status-breakdown]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getStats, getReferrals, getProcess, getAppointments, getTasks, getNewPatients, getFormsStats, getStatusBreakdown };
