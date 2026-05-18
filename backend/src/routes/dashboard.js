const { getDb, getSettings }    = require('../lib/mongo');
const { requireAuth }           = require('../lib/auth');
const { decrypt }               = require('../lib/encryption');

function decryptPatient(doc) {
  if (!doc) return doc;
  const out = { ...doc };
  ['name', 'phone', 'email', 'notes', 'insurance'].forEach(f => {
    if (out[f] != null) out[f] = decrypt(out[f]);
  });
  return out;
}

// GET /api/dashboard/stats?dateFrom=&dateTo=
async function getStats(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const { dateFrom, dateTo } = req.query;

    // Build an optional createdAt date range filter
    const dateMatch = {};
    if (dateFrom || dateTo) {
      dateMatch.createdAt = {};
      if (dateFrom) dateMatch.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   dateMatch.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const pm = { tenantId, ...dateMatch }; // patient match
    const lm = { tenantId, ...dateMatch }; // lead match

    const [
      totalLeads, totalPatients,
      activePatients, completePatients, deniedPatients,
      convertedLeads, formsComplete,
    ] = await Promise.all([
      db.collection('leads').countDocuments(lm),
      db.collection('patients').countDocuments(pm),
      db.collection('patients').countDocuments({ ...pm, status: 'In Progress' }),
      db.collection('patients').countDocuments({ ...pm, status: 'Complete' }),
      db.collection('patients').countDocuments({ ...pm, status: { $in: ['Denied', 'Not Moving Forward'] } }),
      db.collection('leads').countDocuments({ ...lm, convertedToPatient: true }),
      db.collection('patients').countDocuments({ ...pm, formsCompleted: true }),
    ]);

    const conversionRate = totalLeads > 0
      ? Math.round((convertedLeads / totalLeads) * 100)
      : 0;

    const formsRate = totalPatients > 0
      ? Math.round((formsComplete / totalPatients) * 100)
      : 0;

    // Avg intake→feedback — filtered by the same date window
    const pipeline = [
      { $match: { ...pm, intakeAppt: { $exists: true }, feedbackAppt: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$intakeToFeedbackDays' } } },
    ];
    const avgResult = await db.collection('patients').aggregate(pipeline).toArray();
    const avgDays   = avgResult[0] ? Math.round(avgResult[0].avg) : null;

    // Recent activity — always last 15, never date-filtered
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

    const now      = new Date();
    const future   = days => new Date(now.getTime() + days * 86400000);
    const past     = days => new Date(now.getTime() - days * 86400000);

    // Optional date range from query params; fall back to default window
    const fromDate = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
    const toDate   = req.query.dateTo
      ? new Date(new Date(req.query.dateTo).getTime() + 86399999)
      : null;

    // Optional extra filters
    const extra = {};
    if (req.query.insurance) extra.insurance = req.query.insurance;
    if (req.query.category)  extra.category  = req.query.category;

    const [intake, test, feedback, gfe] = await Promise.all([
      db.collection('patients').find({
        tenantId, ...extra,
        intakeAppt: { $gte: fromDate || now, $lte: toDate || future(cfg.intake) },
      }).sort({ intakeAppt: 1 }).toArray(),
      db.collection('patients').find({
        tenantId, ...extra,
        testAppt: { $gte: fromDate || now, $lte: toDate || future(cfg.test) },
      }).sort({ testAppt: 1 }).toArray(),
      db.collection('patients').find({
        tenantId, ...extra,
        feedbackAppt: { $gte: fromDate || now, $lte: toDate || future(cfg.feedback) },
      }).sort({ feedbackAppt: 1 }).toArray(),
      db.collection('patients').find({
        tenantId,
        gfeSent: { $gte: past(cfg.gfeLookback), $lte: now },
      }).sort({ gfeSent: -1 }).toArray(),
    ]);

    res.json({
      intake:   intake.map(decryptPatient),
      test:     test.map(decryptPatient),
      feedback: feedback.map(decryptPatient),
      gfe:      gfe.map(decryptPatient),
      config:   cfg,
    });
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

    res.json({
      missingIntake:    missingIntake.map(decryptPatient),
      missingTest:      missingTest.map(decryptPatient),
      missingFeedback:  missingFeedback.map(decryptPatient),
    });
  } catch (err) {
    console.error('[tasks]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/dashboard/new-patients?dateFrom=&dateTo=&groupBy=day|week|month
async function getNewPatients(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const { dateFrom, dateTo, groupBy = 'day' } = req.query;

    const match = { tenantId };
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   match.createdAt.$lte = new Date(new Date(dateTo).setHours(23,59,59,999));
    }

    let groupId;
    if (groupBy === 'month') {
      groupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
    } else if (groupBy === 'week') {
      groupId = { year: { $isoWeekYear: '$createdAt' }, week: { $isoWeek: '$createdAt' } };
    } else {
      groupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
    }

    const pipeline = [
      { $match: match },
      { $group: { _id: groupId, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
    ];

    const data = await db.collection('patients').aggregate(pipeline).toArray();
    res.json({ data, groupBy });
  } catch (err) {
    console.error('[new-patients]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/dashboard/status-timeseries?dateFrom=&dateTo=&groupBy=day|week|month
async function getStatusTimeSeries(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;
    const { dateFrom, dateTo, groupBy = 'day' } = req.query;

    const match = { tenantId };
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   match.createdAt.$lte = new Date(new Date(dateTo).setHours(23,59,59,999));
    }

    let timePart;
    if (groupBy === 'month') {
      timePart = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
    } else if (groupBy === 'week') {
      timePart = { year: { $isoWeekYear: '$createdAt' }, week: { $isoWeek: '$createdAt' } };
    } else {
      timePart = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { ...timePart, status: '$status' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
    ];

    const data = await db.collection('patients').aggregate(pipeline).toArray();
    res.json({ data, groupBy });
  } catch (err) {
    console.error('[status-timeseries]', err);
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

// GET /api/dashboard/appeals  — patients with sent-but-not-received appeals
async function getOutstandingAppeals(req, res) {
  try {
    const db       = await getDb();
    const tenantId = req.user.tenantId;

    // Match patients where at least one appeal is sent but the corresponding received date is missing
    const patients = await db.collection('patients').find({
      tenantId,
      $or: [
        { appealsSentClient:  { $exists: true, $ne: null }, appealsRecClient:  null },
        { appealsSentBilling: { $exists: true, $ne: null }, appealsRecBilling: null },
      ],
    }).sort({ appealsSentClient: -1 }).toArray();

    res.json({ appeals: patients.map(decryptPatient), total: patients.length });
  } catch (err) {
    console.error('[appeals]', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getStats, getReferrals, getProcess, getAppointments, getTasks, getNewPatients, getFormsStats, getStatusBreakdown, getOutstandingAppeals, getStatusTimeSeries };
