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
// Fields from originalPayload already shown in standard rows or internal to MetForm
const SKIP_PAYLOAD_KEYS = new Set([
  'first_name','last_name','name','email','phone','mobile',
  'notes','message','comment','interest',
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
  'gclid','fbclid','referrer','form_id','source','city',
]);

function shouldSkipPayloadKey(k) {
  const l = k.toLowerCase();
  return SKIP_PAYLOAD_KEYS.has(l) ||
    l.includes('nonce') || l.includes('action') ||
    l === 'metform_id' || l.endsWith('_id') ||
    l.endsWith('_name') || l.endsWith('_email') ||
    l.endsWith('_telephone') || l.endsWith('_phone') || l.endsWith('_mobile');
}

function extraPayloadRows(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const rows = Object.entries(payload)
    .filter(([k, v]) => !shouldSkipPayloadKey(k) && v !== '' && v != null)
    .map(([k, v]) => {
      const label = k
        .replace(/^metform_mf_/i, '').replace(/^metform_/i, '').replace(/^mf[-_]/i, '')
        .replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `<tr><td style="padding:10px 16px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb">${label}</td><td style="padding:10px 16px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb">${v}</td></tr>`;
    });
  return rows.join('');
}

async function sendNewLeadEmail({ tenantId, name, email, phone, source, originalPayload }) {
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

  const displayName   = name   || 'Not provided';
  const displayEmail  = email  || 'Not provided';
  const displayPhone  = phone  || 'Not provided';
  const displaySource = source || 'Website';

  const now = new Date().toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

  const subject = `[Insight] New Patient Inquiry — ${displayName}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;border-radius:8px 8px 0 0;padding:28px 32px">
            <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase">Insight Patient Portal</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700">New Patient Inquiry Received</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px">

            <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6">
              A new prospective patient has submitted an inquiry through the website. Please review the details below and follow up at your earliest convenience.
            </p>

            <!-- Info table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
              <tr style="background:#f8fafc">
                <td style="padding:10px 16px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;width:130px;border-bottom:1px solid #e5e7eb">Full Name</td>
                <td style="padding:10px 16px;color:#111827;font-size:14px;font-weight:600;border-bottom:1px solid #e5e7eb">${displayName}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb">Email</td>
                <td style="padding:10px 16px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb">${displayEmail}</td>
              </tr>
              <tr style="background:#f8fafc">
                <td style="padding:10px 16px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb">Phone</td>
                <td style="padding:10px 16px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb">${displayPhone}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb">Referral Source</td>
                <td style="padding:10px 16px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb">${displaySource}</td>
              </tr>
              ${extraPayloadRows(originalPayload)}
            </table>

            <p style="margin:20px 0 4px;color:#6b7280;font-size:12px">Received on: ${now}</p>

            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" style="margin-top:28px">
              <tr>
                <td style="background:#1e3a5f;border-radius:6px">
                  <a href="${process.env.APP_URL || ''}/leads"
                     style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.3px">
                    View Lead in CRM &rarr;
                  </a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:20px 32px">
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6">
              This is an automated notification from the Insight Patient Portal CRM system.<br>
              Please do not reply directly to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
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
