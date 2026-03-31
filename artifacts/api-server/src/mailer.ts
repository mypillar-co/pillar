import { Resend } from "resend";
import { logger } from "./lib/logger";

const FROM_ADDRESS = "Pillar <hello@mypillar.co>";
const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL ?? "steward.ai.app@gmail.com";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export type MailResult = { sent: boolean; simulated?: boolean; error?: string };

async function send(to: string, subject: string, html: string, text: string): Promise<MailResult> {
  const resend = getResend();
  if (!resend) {
    logger.info({ to, subject }, "[MAILER] No RESEND_API_KEY — email simulated");
    return { sent: false, simulated: true };
  }
  try {
    const { error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html, text });
    if (error) {
      logger.warn({ to, subject, error }, "[MAILER] Resend error");
      return { sent: false, error: error.message };
    }
    logger.info({ to, subject }, "[MAILER] Email sent");
    return { sent: true };
  } catch (err: unknown) {
    logger.warn({ to, subject, err }, "[MAILER] Resend threw");
    return { sent: false, error: String(err) };
  }
}

function wrap(body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#0f1e35;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
<tr><td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.08);">
  <span style="font-size:20px;font-weight:700;color:#e8b84b;letter-spacing:-0.3px;">Pillar</span>
</td></tr>
<tr><td style="padding:32px 40px;color:#e2e8f0;font-size:15px;line-height:1.7;">
  ${body}
</td></tr>
<tr><td style="padding:20px 40px 28px;border-top:1px solid rgba(255,255,255,0.08);">
  <p style="margin:0;color:#64748b;font-size:12px;">Pillar · mypillar.co · Your organization, on autopilot.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function sendWelcomeEmail(to: string, firstName: string, orgName: string): Promise<MailResult> {
  const name = firstName || "there";
  const subject = `Welcome to Pillar, ${name} — let's get your website live`;
  const html = wrap(`
    <p style="margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 16px;">Welcome to Pillar. I'm glad you're here.</p>
    <p style="margin:0 0 16px;">Your organization <strong style="color:#e8b84b;">${orgName}</strong> is set up and ready. The first thing to do is build your website — it takes about 10 minutes and you just answer a few questions.</p>
    <p style="margin:0 24px;">
      <a href="https://mypillar.co/dashboard/site" style="background:#e8b84b;color:#0c1526;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Build my website →</a>
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">If you have any questions, just reply to this email. I'm a real person and I'll get back to you.</p>
  `);
  const text = `Hi ${name},\n\nWelcome to Pillar. Your organization ${orgName} is set up and ready.\n\nBuild your website at: https://mypillar.co/dashboard/site\n\nQuestions? Reply to this email.\n\nPillar`;
  return send(to, subject, html, text);
}

export async function sendWebsiteNudge(to: string, firstName: string, orgName: string): Promise<MailResult> {
  const name = firstName || "there";
  const subject = `${orgName} — your website is still waiting`;
  const html = wrap(`
    <p style="margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 16px;">You signed up for Pillar a couple of days ago but haven't built your website yet. No rush — but I wanted to check in.</p>
    <p style="margin:0 0 16px;">It really does take about 10 minutes. You answer a few questions about <strong style="color:#e8b84b;">${orgName}</strong> and Pillar builds the site for you.</p>
    <p style="margin:0 24px;">
      <a href="https://mypillar.co/dashboard/site" style="background:#e8b84b;color:#0c1526;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Build my website now →</a>
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">If something isn't working or you have a question, just reply and I'll help.</p>
  `);
  const text = `Hi ${name},\n\nYou signed up for Pillar a couple of days ago but haven't built your website yet.\n\nBuild your website at: https://mypillar.co/dashboard/site\n\nIt only takes 10 minutes — just answer a few questions and Pillar builds it.\n\nPillar`;
  return send(to, subject, html, text);
}

export async function sendTrialEndingEmail(to: string, firstName: string, orgName: string, daysLeft: number): Promise<MailResult> {
  const name = firstName || "there";
  const subject = `Your Pillar trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const html = wrap(`
    <p style="margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 16px;">Your free trial for <strong style="color:#e8b84b;">${orgName}</strong> ends in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong>.</p>
    <p style="margin:0 0 16px;">Everything you've built — your website, your events, your connections — stays exactly as is when you subscribe. Nothing resets.</p>
    <p style="margin:0 0 16px;">Plans start at $29/month. Cancel any time.</p>
    <p style="margin:0 24px;">
      <a href="https://mypillar.co/dashboard" style="background:#e8b84b;color:#0c1526;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Keep my account →</a>
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">Questions about pricing? Reply to this email.</p>
  `);
  const text = `Hi ${name},\n\nYour Pillar trial for ${orgName} ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.\n\nKeep your account at: https://mypillar.co/dashboard\n\nPlans start at $29/month. Cancel any time.\n\nPillar`;
  return send(to, subject, html, text);
}

export async function sendPaymentFailedEmail(to: string, firstName: string, orgName: string): Promise<MailResult> {
  const name = firstName || "there";
  const subject = `Action needed — payment issue with your Pillar account`;
  const html = wrap(`
    <p style="margin:0 0 16px;">Hi ${name},</p>
    <p style="margin:0 0 16px;">We couldn't process your payment for <strong style="color:#e8b84b;">${orgName}</strong>. Your account is still active — we just need you to update your payment method.</p>
    <p style="margin:0 24px;">
      <a href="https://mypillar.co/dashboard/settings" style="background:#e8b84b;color:#0c1526;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Update payment method →</a>
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">If you think this is a mistake or need help, just reply to this email.</p>
  `);
  const text = `Hi ${name},\n\nWe couldn't process your payment for ${orgName}. Update your payment method at: https://mypillar.co/dashboard/settings\n\nQuestions? Reply to this email.\n\nPillar`;
  return send(to, subject, html, text);
}

export async function sendSupportTicketResponse(to: string, firstName: string, subject: string, responseText: string): Promise<MailResult> {
  const name = firstName || "there";
  const emailSubject = `Re: ${subject}`;
  const paragraphs = responseText.split("\n").filter(Boolean).map(p => `<p style="margin:0 0 14px;">${p}</p>`).join("");
  const html = wrap(`
    <p style="margin:0 0 16px;">Hi ${name},</p>
    ${paragraphs}
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">Need more help? Reply to this email or visit <a href="https://mypillar.co/dashboard/help" style="color:#e8b84b;">your help center</a>.</p>
  `);
  const text = `Hi ${name},\n\n${responseText}\n\nNeed more help? Reply to this email.\n\nPillar`;
  return send(to, emailSubject, html, text);
}

export async function sendOutreachEmail(
  to: string, contactName: string, orgName: string, orgType: string,
  currentWebsite: string | null | undefined, isFollowUp: boolean
): Promise<MailResult> {
  const name = contactName || "there";
  const hasWebsite = currentWebsite && currentWebsite.length > 0;
  const subject = isFollowUp
    ? `Following up — ${orgName}`
    : `${orgName} — quick question`;

  const intro = isFollowUp
    ? `<p style="margin:0 0 16px;">Hi ${name}, I sent a note a few days ago and wanted to follow up briefly.</p>`
    : `<p style="margin:0 0 16px;">Hi ${name},</p>`;

  const body = hasWebsite
    ? `<p style="margin:0 0 16px;">I came across ${orgName} and noticed your website. A lot of ${orgType || "civic organizations"} we work with spend a lot of time keeping their sites updated, posting to social media, and managing their event calendar manually.</p>`
    : `<p style="margin:0 0 16px;">I noticed ${orgName} doesn't appear to have a website yet. That's really common for ${orgType || "civic organizations"} — there's usually no one whose job it is to set one up.</p>`;

  const html = wrap(`
    ${intro}
    ${body}
    <p style="margin:0 0 16px;">I run a platform called <strong style="color:#e8b84b;">Pillar</strong> that handles all of that automatically — website, events, social media, board approvals — for about the cost of a dinner out each month.</p>
    <p style="margin:0 0 16px;">Is managing your org's digital presence something that takes more time than it should?</p>
    <p style="margin:0 24px;">
      <a href="https://mypillar.co" style="background:#e8b84b;color:#0c1526;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">See how Pillar works →</a>
    </p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">Happy to send more info or just let you poke around free for 14 days. No card required.</p>
  `);
  const text = `Hi ${name},\n\nI run a platform called Pillar that handles website, events, social media, and board approvals automatically for civic organizations.\n\nIs managing ${orgName}'s digital presence something that takes more time than it should?\n\nSee how it works: https://mypillar.co\n\nHappy to chat or just let you try it free for 14 days.`;
  return send(to, subject, html, text);
}

export async function sendFounderDigest(subject: string, bodyHtml: string, bodyText: string): Promise<MailResult> {
  return send(FOUNDER_EMAIL, subject, wrap(bodyHtml), bodyText);
}
