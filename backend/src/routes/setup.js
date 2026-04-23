/**
 * One-time setup: POST /api/setup
 * Creates tenant, all seed users, API key, settings, and sample data.
 * Disable after first use by setting SETUP_DONE=true in env.
 */
const crypto           = require('crypto');
const { getDb }        = require('../lib/mongo');
const { hashPassword } = require('../lib/auth');

module.exports = async function setup(req, res) {
  if (process.env.SETUP_DONE === 'true') {
    return res.status(403).json({ error: 'Setup already completed. Remove SETUP_DONE from env to re-run.' });
  }

  try {
    const db = await getDb();
    const { adminEmail, adminPassword, tenantName } = req.body;

    if (!adminEmail || !adminPassword || !tenantName) {
      return res.status(400).json({ error: 'adminEmail, adminPassword, tenantName required' });
    }

    const tenantId = tenantName.toLowerCase().replace(/\s+/g, '-');

    // ── Tenant ────────────────────────────────────────────────────────────────
    await db.collection('tenants').updateOne(
      { _id: tenantId },
      { $setOnInsert: { _id: tenantId, name: tenantName, createdAt: new Date() } },
      { upsert: true }
    );

    // ── Users ─────────────────────────────────────────────────────────────────
    const seedUsers = [
      { email: adminEmail.toLowerCase(),   password: adminPassword,  role: 'admin',    name: 'Admin' },
      { email: 'staff@clinic.com',         password: 'ChangeMe123!', role: 'staff',    name: 'Staff User' },
      { email: 'view@clinic.com',          password: 'ChangeMe123!', role: 'readonly', name: 'View Only' },
    ];

    for (const u of seedUsers) {
      await db.collection('users').updateOne(
        { email: u.email },
        { $setOnInsert: {
          email:        u.email,
          name:         u.name,
          passwordHash: await hashPassword(u.password),
          tenantId,
          role:         u.role,
          active:       true,
          createdAt:    new Date(),
          lastLogin:    null,
        }},
        { upsert: true }
      );
    }

    // ── API key (for WordPress plugin) ────────────────────────────────────────
    const rawKey  = 'il_' + crypto.randomBytes(24).toString('hex');
    const pepper  = process.env.IL_API_KEY_PEPPER || 'default-pepper';
    const keyHash = crypto.createHash('sha256').update(rawKey + pepper).digest('hex');

    await db.collection('api_keys').updateOne(
      { tenantId },
      { $setOnInsert: { tenantId, keyHash, name: 'WordPress Plugin Key', active: true, createdAt: new Date() } },
      { upsert: true }
    );

    // ── Settings ──────────────────────────────────────────────────────────────
    await db.collection('settings').updateOne(
      { tenantId },
      { $setOnInsert: {
        tenantId,
        appointmentDays: { intake: 7, test: 7, feedback: 7, gfeLookback: 100, outstandingLookback: 90 },
        statusList:      ['In Progress', 'Complete', 'Not Moving Forward', 'On Hold', 'Denied', 'No Response'],
        insuranceList: [
          'Aetna','Aetna Better','Ambetter','BCBS','BCBS/Medicaid','BCBS/SoonerCare',
          'BlueLinc','Cash Pay','Cigna','Healthcare Hwy','Healthchoice','Humana',
          'Humana Horizon','Kempton','Medicaid','Medicare/Medicaid','Ok Healthcare',
          'Okla Complete','Quantum','Sooner Select','SoonerCare','Tricare','UH',
          'UMR','United Health','Web-TPA',
        ],
        referralSourceList: [
          'ADHD Support Group','Arbuckle','Autism website','Call In','Call In (PSO)',
          'Choctaw Family','Deer Creek','Doctor','Dr Aaron','Dr George','Dr Harris-OBGYN',
          'Dr Jill Mays','Dr Matson','Dr Naidu','Dr Partridge','Dr Phillips',
          'Dr Tereas Rodriguez','Dr Whalen','Elite Therapy','Evolve','META/FB',
          'Flores Pediatrics','Friend','Google','Go Daddy','Integris','Life Psych',
          'Moore Family','NW Pediatrics','Oklahoma Pain Physicians','Open Arms Foster',
          'PC School','PCP','Pediatric Group','Perry Klaassen','PSO','Psychiatric Wellness',
          'Psychiatrist','Red Rock','Serenity','Serenity Psych','Shines','Summit Health',
          'Village Center Pedi','Website',
        ],
        createdAt: new Date(),
      }},
      { upsert: true }
    );

    // ── Sample patients ───────────────────────────────────────────────────────
    const now = new Date();
    const daysAgo = n => new Date(now.getTime() - n * 86400000);
    const daysAhead = n => new Date(now.getTime() + n * 86400000);

    const samplePatients = [
      // Complete patients
      { name: 'Emma Johnson',   status: 'Complete',    category: 'Standard',        insurance: 'BCBS',     referralSource: 'Google',    referralDate: daysAgo(120), intakeAppt: daysAgo(90),  testAppt: daysAgo(60),  feedbackAppt: daysAgo(30),  formsSent: daysAgo(100), formsRec: daysAgo(95), intakeToTestDays: 30, testToFeedbackDays: 30, intakeToFeedbackDays: 60, formsCompleted: true, copay: 40, balance: 0 },
      { name: 'Marcus Williams',status: 'Complete',    category: 'Standard',        insurance: 'Aetna',    referralSource: 'Dr Naidu',  referralDate: daysAgo(130), intakeAppt: daysAgo(100), testAppt: daysAgo(65),  feedbackAppt: daysAgo(20),  formsSent: daysAgo(110), formsRec: daysAgo(105), intakeToTestDays: 35, testToFeedbackDays: 45, intakeToFeedbackDays: 80, formsCompleted: true, copay: 50, balance: 0 },
      { name: 'Sofia Martinez', status: 'Complete',    category: 'Pain Management', insurance: 'SoonerCare',referralSource: 'Life Psych',referralDate: daysAgo(150), intakeAppt: daysAgo(110), testAppt: daysAgo(75),  feedbackAppt: daysAgo(25),  formsSent: daysAgo(140), formsRec: daysAgo(135), intakeToTestDays: 35, testToFeedbackDays: 50, intakeToFeedbackDays: 85, formsCompleted: true, copay: 30, balance: 0 },
      // In Progress
      { name: 'Jaylen Brooks',  status: 'In Progress', category: 'Standard',        insurance: 'Humana',   referralSource: 'META/FB',   referralDate: daysAgo(45),  intakeAppt: daysAgo(20),  formsSent: daysAgo(40),  formsRec: daysAgo(35), formsCompleted: true, copay: 40 },
      { name: 'Aaliyah Carter', status: 'In Progress', category: 'Standard',        insurance: 'Medicaid', referralSource: 'Friend',    referralDate: daysAgo(30),  intakeAppt: daysAhead(3), formsSent: daysAgo(25), formsCompleted: false, copay: 0 },
      { name: 'Noah Davis',     status: 'In Progress', category: 'Standard',        insurance: 'BCBS',     referralSource: 'Dr George', referralDate: daysAgo(60),  intakeAppt: daysAgo(35),  testAppt: daysAhead(5), formsSent: daysAgo(55), formsRec: daysAgo(50), formsCompleted: true, copay: 40 },
      { name: 'Isabella Thompson',status:'In Progress',category: 'Pain Management', insurance: 'Cigna',    referralSource: 'Arbuckle',  referralDate: daysAgo(20),  formsSent: daysAgo(15), formsCompleted: false, copay: 35 },
      // Denied
      { name: 'Elijah Moore',   status: 'Denied',      category: 'Standard',        insurance: 'UMR',      referralSource: 'Google',    referralDate: daysAgo(90),  intakeAppt: daysAgo(70), formsSent: daysAgo(85), formsRec: daysAgo(80), formsCompleted: true, copay: 50, notes: 'Pre-auth denied' },
      { name: 'Mia Jackson',    status: 'Denied',      category: 'Standard',        insurance: 'Aetna',    referralSource: 'Website',   referralDate: daysAgo(80),  formsSent: daysAgo(75), formsRec: daysAgo(70), formsCompleted: true, copay: 40, notes: 'Denied by insurance' },
      // No Response
      { name: 'Liam Wilson',    status: 'No Response', category: 'Standard',        insurance: 'Humana',   referralSource: 'META/FB',   referralDate: daysAgo(25),  formsSent: daysAgo(20), formsCompleted: false },
      { name: 'Amara Osei',     status: 'No Response', category: 'Standard',        insurance: 'SoonerCare',referralSource: 'Dr Matson', referralDate: daysAgo(18),  formsSent: daysAgo(15), formsCompleted: false },
      // Not Moving Forward
      { name: 'Ethan Brown',    status: 'Not Moving Forward', category: 'Standard', insurance: 'Cash Pay', referralSource: 'Friend',    referralDate: daysAgo(70),  notes: 'Decided not to proceed' },
      { name: 'Zoe Garcia',     status: 'Not Moving Forward', category: 'Standard', insurance: 'BCBS',     referralSource: 'Google',    referralDate: daysAgo(55),  notes: 'Moving to different provider' },
      // Pain Management - In Progress
      { name: 'Ryan Mitchell',  status: 'In Progress', category: 'Pain Management', insurance: 'Web-TPA',  referralSource: 'PSO',       referralDate: daysAgo(40),  intakeAppt: daysAhead(2), formsSent: daysAgo(35), formsCompleted: false },
      { name: 'Priya Patel',    status: 'In Progress', category: 'Pain Management', insurance: 'Cigna',    referralSource: 'Dr Partridge',referralDate: daysAgo(50), intakeAppt: daysAgo(25),  testAppt: daysAhead(7), formsSent: daysAgo(45), formsRec: daysAgo(40), formsCompleted: true, copay: 45 },
    ];

    for (const p of samplePatients) {
      await db.collection('patients').insertOne({
        ...p,
        tenantId,
        createdBy:      'system',
        lastModifiedBy: 'system',
        createdAt:      new Date(),
        updatedAt:      new Date(),
      });
    }

    // ── Sample leads ──────────────────────────────────────────────────────────
    const sampleLeads = [
      { name: 'Chris Anderson', email: 'chris@email.com', phone: '405-555-0101', source: 'WordPress', referralSource: 'Google',   status: 'New',       convertedToPatient: false, createdAt: daysAgo(5)  },
      { name: 'Ashley Thomas',  email: 'ashley@email.com',phone: '405-555-0102', source: 'WordPress', referralSource: 'META/FB',  status: 'Contacted', convertedToPatient: false, createdAt: daysAgo(10) },
      { name: 'Daniel Lee',     email: 'daniel@email.com',phone: '405-555-0103', source: 'WordPress', referralSource: 'Website',  status: 'Forms Sent',convertedToPatient: false, createdAt: daysAgo(3)  },
      { name: 'Kayla Scott',    email: 'kayla@email.com', phone: '405-555-0104', source: 'WordPress', referralSource: 'Friend',   status: 'No Response',convertedToPatient: false, createdAt: daysAgo(20) },
      { name: 'James White',    email: 'james@email.com', phone: '405-555-0105', source: 'WordPress', referralSource: 'Dr Naidu', status: 'New',        convertedToPatient: false, createdAt: daysAgo(16) },
    ];

    for (const l of sampleLeads) {
      await db.collection('leads').updateOne(
        { email: l.email, tenantId },
        { $setOnInsert: { ...l, tenantId, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    res.json({
      message:  'Setup complete!',
      tenantId,
      apiKey:   rawKey,
      users:    seedUsers.map(u => ({ email: u.email, role: u.role })),
      note:     'Save the apiKey — it will not be shown again. Set SETUP_DONE=true in your env vars.',
    });
  } catch (err) {
    console.error('[setup]', err);
    res.status(500).json({ error: 'Server error' });
  }
};
