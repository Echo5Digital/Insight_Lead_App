'use strict';
/**
 * Email notification utility — SMTP via nodemailer.
 *
 * Required .env variables:
 *   SMTP_HOST       e.g.  mail.yourdomain.com
 *   SMTP_PORT       e.g.  587
 *   SMTP_USER       e.g.  alerts@yourdomain.com
 *   SMTP_PASS       SMTP password / app password
 *   SMTP_FROM       e.g.  "Insight CRM" <alerts@yourdomain.com>
 *   NOTIFY_EMAILS   comma-separated list of recipient addresses
 *                   e.g.  staff@yourdomain.com,admin@yourdomain.com
 */
const nodemailer   = require('nodemailer');
const { getSettings } = require('./mongo');

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  const port   = parseInt(SMTP_PORT || '587', 10);
  const secure = SMTP_SECURE !== undefined ? SMTP_SECURE === 'true' : port === 465;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/**
 * Send a new web lead notification email.
 * Silently skips if SMTP env vars are not configured.
 */
async function sendNewLeadEmail({ tenantId, name, email, phone, source }) {
  const transport = getTransport();
  if (!transport) {
    console.warn('[mailer] SMTP not configured — skipping notification email');
    return;
  }

  // Prefer recipients stored in DB settings; fall back to NOTIFY_EMAILS env var
  let recipients = [];
  if (tenantId) {
    try {
      const settings = await getSettings(tenantId);
      if (settings.notifyEmails?.length) recipients = settings.notifyEmails;
    } catch (e) {
      console.warn('[mailer] Could not load settings for notifyEmails:', e.message);
    }
  }
  if (!recipients.length) {
    recipients = (process.env.NOTIFY_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
  }
  if (!recipients.length) {
    console.warn('[mailer] No notification recipients configured — skipping email');
    return;
  }

  const displayName  = name  || '(no name)';
  const displayEmail = email || '(no email)';
  const displayPhone = phone || '(no phone)';
  const displaySource = source || 'website';

  const subject = `New Web Lead: ${displayName}`;
  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#1e40af">New Website Lead</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#64748b;width:100px">Name</td><td style="padding:6px 0;font-weight:600">${displayName}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0">${displayEmail}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Phone</td><td style="padding:6px 0">${displayPhone}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Source</td><td style="padding:6px 0">${displaySource}</td></tr>
      </table>
      <p style="margin-top:20px">
        <a href="${process.env.APP_URL || ''}/leads" style="background:#1e40af;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
          View in CRM
        </a>
      </p>
    </div>
  `;

  try {
    await transport.sendMail({
      from:    process.env.SMTP_FROM || process.env.SMTP_USER,
      to:      recipients.join(', '),
      subject,
      html,
    });
    console.log(`[mailer] New lead notification sent to ${recipients.join(', ')}`);
  } catch (err) {
    // Never crash the webhook if email fails
    console.error('[mailer] Failed to send notification:', err.message);
  }
}

module.exports = { sendNewLeadEmail };
