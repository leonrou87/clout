import nodemailer from 'nodemailer';

// CLOUT transactional email via the KYTEPUSH Gmail inbox (kytepush@gmail.com).
// Uses the IMAP/SMTP App Password (GMAIL_APP_PASSWORD) — set as Vercel env vars, never
// committed. Sending is best-effort: callers should not block the user flow on it.

const USER = process.env.GMAIL_USER || '';
const PASS = process.env.GMAIL_APP_PASSWORD || '';
export const SUPPORT_INBOX = USER || 'kytepush@gmail.com';
export const mailEnabled = Boolean(USER && PASS);

let transporter: nodemailer.Transporter | null = null;
function tx() {
  if (!transporter) transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: USER, pass: PASS },
  });
  return transporter;
}

export async function sendMail(opts: { to: string; subject: string; html: string; replyTo?: string }) {
  if (!mailEnabled) return { ok: false, skipped: 'mail_not_configured' };
  await tx().sendMail({ from: `CLOUT <${USER}>`, to: opts.to, subject: opts.subject, html: opts.html, replyTo: opts.replyTo });
  return { ok: true };
}

export const isEmail = (e: unknown) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

// shared shell so all CLOUT emails look consistent
export function shell(body: string) {
  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;background:#08090f;color:#eef0f6;padding:28px;border-radius:16px;max-width:520px">
    <div style="font-weight:800;font-size:20px;color:#ff2e88;letter-spacing:1px">◈ CLOUT</div>
    <div style="margin-top:16px;line-height:1.55;font-size:15px;color:#cfd2de">${body}</div>
    <hr style="border:none;border-top:1px solid #23232f;margin:22px 0"/>
    <div style="font-size:12px;color:#8a8aa0">CLOUT is a digital collectible card game. Coins & cards are in-app only and never cashable. Scores are sourced public momentum, not factual claims. Reply to this email to reach us.</div>
  </div>`;
}
