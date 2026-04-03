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

async function send(
  to: string,
  subject: string,
  html: string,
  text: string,
  fromAddress?: string,
): Promise<MailResult> {
  const resend = getResend();
  if (!resend) {
    logger.info({ to, subject }, "[MAILER] No RESEND_API_KEY — email simulated");
    return { sent: false, simulated: true };
  }
  try {
    const { error } = await resend.emails.send({
      from: fromAddress ?? FROM_ADDRESS,
      to,
      subject,
      html,
      text,
    });
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

function wrap(body: string, accentColor = "#f59e0b"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Pillar</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .email-body { padding: 24px 20px !important; }
      .feature-cell { display: block !important; width: 100% !important; padding: 8px 0 !important; }
      .btn { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Email container -->
        <table class="email-container" role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#0a0f1e;border-radius:16px 16px 0 0;padding:28px 40px;border-bottom:1px solid rgba(255,255,255,0.06);">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right:10px;vertical-align:middle;">
                          <img src="https://mypillar.co/pillar-logo.svg" width="32" height="32" alt="Pillar" style="display:block;border:0;" />
                        </td>
                        <td style="vertical-align:middle;">
                          <span style="font-size:20px;font-weight:700;color:${accentColor};letter-spacing:-0.3px;line-height:1;">Pillar</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:12px;color:rgba(255,255,255,0.35);letter-spacing:0.5px;text-transform:uppercase;">Your organization, on autopilot.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="email-body" style="background-color:#0d1526;padding:40px 40px 32px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#080d1a;border-radius:0 0 16px 16px;padding:20px 40px 24px;border-top:1px solid rgba(255,255,255,0.06);">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;">
                      Pillar &nbsp;·&nbsp; <a href="https://mypillar.co" style="color:rgba(255,255,255,0.3);text-decoration:none;">mypillar.co</a> &nbsp;·&nbsp; Your organization, on autopilot.
                    </p>
                    <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.2);">
                      You're receiving this because you signed up for Pillar. 
                      <a href="https://mypillar.co/dashboard/settings" style="color:rgba(255,255,255,0.2);text-decoration:underline;">Manage email preferences</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function goldBtn(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr>
      <td style="border-radius:10px;background-color:#f59e0b;">
        <a href="${href}" class="btn" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#0a0f1e;text-decoration:none;letter-spacing:-0.2px;border-radius:10px;">${label} &rarr;</a>
      </td>
    </tr>
  </table>`;
}

function divider(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0;">
    <tr><td style="height:1px;background-color:rgba(255,255,255,0.06);font-size:0;line-height:0;">&nbsp;</td></tr>
  </table>`;
}

// ─── Welcome Email ────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, firstName: string, orgName: string): Promise<MailResult> {
  const name = firstName || "there";
  const subject = `Welcome to Pillar — let's get ${orgName} online`;

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#f59e0b;letter-spacing:1px;text-transform:uppercase;">Welcome aboard</p>
    <h1 style="margin:0 0 20px;font-size:26px;font-weight:800;color:#ffffff;line-height:1.25;letter-spacing:-0.5px;">Hi ${name}, you're all set.</h1>

    <p style="margin:0 0 20px;font-size:16px;color:rgba(255,255,255,0.75);line-height:1.7;">
      <strong style="color:#ffffff;">${orgName}</strong> is now on Pillar. Your 14-day free trial is active — no card required, no limits.
    </p>

    <p style="margin:0 0 8px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">
      Here's what you can set up right now:
    </p>

    <!-- Feature list -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0 24px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="36" style="vertical-align:top;padding-top:1px;">
                <div style="width:28px;height:28px;background-color:rgba(245,158,11,0.12);border-radius:8px;text-align:center;line-height:28px;font-size:14px;">🌐</div>
              </td>
              <td style="padding-left:12px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#ffffff;">Your website</p>
                <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.45);line-height:1.5;">Answer a few questions — Pillar builds it for you in minutes.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="36" style="vertical-align:top;padding-top:1px;">
                <div style="width:28px;height:28px;background-color:rgba(245,158,11,0.12);border-radius:8px;text-align:center;line-height:28px;font-size:14px;">📅</div>
              </td>
              <td style="padding-left:12px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#ffffff;">Events & ticketing</p>
                <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.45);line-height:1.5;">Publish events, sell tickets, and track attendance — all in one place.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="36" style="vertical-align:top;padding-top:1px;">
                <div style="width:28px;height:28px;background-color:rgba(245,158,11,0.12);border-radius:8px;text-align:center;line-height:28px;font-size:14px;">✅</div>
              </td>
              <td style="padding-left:12px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#ffffff;">Board approvals</p>
                <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.45);line-height:1.5;">Send motions to board members and collect votes by email — no login required for them.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="36" style="vertical-align:top;padding-top:1px;">
                <div style="width:28px;height:28px;background-color:rgba(245,158,11,0.12);border-radius:8px;text-align:center;line-height:28px;font-size:14px;">🌐</div>
              </td>
              <td style="padding-left:12px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#ffffff;">Custom domain</p>
                <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.45);line-height:1.5;">Search for and claim a domain for your organization — included with most plans.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${goldBtn("https://mypillar.co/dashboard", "Go to my dashboard")}

    ${divider()}

    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.7;">
      Questions? Just reply to this email — a real person will get back to you.
    </p>
  `;

  const text = `Hi ${name},\n\nWelcome to Pillar. ${orgName} is set up and your 14-day free trial is active.\n\nGet started at: https://mypillar.co/dashboard\n\nYou can build your website, publish events, manage board approvals, and claim a custom domain.\n\nQuestions? Reply to this email.\n\n— Pillar`;

  return send(to, subject, wrap(body));
}

// ─── Website Nudge ─────────────────────────────────────────────────────────

export async function sendWebsiteNudge(to: string, firstName: string, orgName: string): Promise<MailResult> {
  const name = firstName || "there";
  const subject = `${orgName} — your website is still waiting`;
  const body = `
    <h1 style="margin:0 0 20px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.3;letter-spacing:-0.5px;">Your website is waiting for you.</h1>
    <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">
      Hi ${name}, you signed up for Pillar a couple of days ago but haven't built your website yet. No rush — but I wanted to check in.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">
      It really does take about 10 minutes. You answer a few questions about <strong style="color:#ffffff;">${orgName}</strong> and Pillar builds the site for you.
    </p>
    ${goldBtn("https://mypillar.co/dashboard/site", "Build my website")}
    ${divider()}
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.7;">If something isn't working or you have a question, just reply and I'll help.</p>
  `;
  const text = `Hi ${name},\n\nYou signed up for Pillar a couple of days ago but haven't built your website yet.\n\nBuild your website at: https://mypillar.co/dashboard/site\n\nIt only takes 10 minutes.\n\nPillar`;
  return send(to, subject, wrap(body));
}

// ─── Trial Ending ────────────────────────────────────────────────────────────

export async function sendTrialEndingEmail(to: string, firstName: string, orgName: string, daysLeft: number): Promise<MailResult> {
  const name = firstName || "there";
  const subject = `Your Pillar trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const urgencyColor = daysLeft <= 2 ? "#ef4444" : "#f59e0b";
  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${urgencyColor};letter-spacing:1px;text-transform:uppercase;">${daysLeft} day${daysLeft === 1 ? "" : "s"} left</p>
    <h1 style="margin:0 0 20px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.3;letter-spacing:-0.5px;">Your free trial is ending soon.</h1>
    <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">
      Hi ${name}, your trial for <strong style="color:#ffffff;">${orgName}</strong> ends in <strong style="color:#ffffff;">${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">
      Everything you've built — your website, events, board approvals, contacts — stays exactly as is. Nothing resets when you subscribe.
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">
      Plans start at <strong style="color:#ffffff;">$29/month</strong>. Cancel any time.
    </p>
    ${goldBtn("https://mypillar.co/dashboard", "Keep my account")}
    ${divider()}
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.7;">Questions about pricing? Reply to this email.</p>
  `;
  const text = `Hi ${name},\n\nYour Pillar trial for ${orgName} ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.\n\nKeep your account at: https://mypillar.co/dashboard\n\nPlans start at $29/month. Cancel any time.\n\nPillar`;
  return send(to, subject, wrap(body));
}

// ─── Payment Failed ──────────────────────────────────────────────────────────

export async function sendPaymentFailedEmail(to: string, firstName: string, orgName: string): Promise<MailResult> {
  const name = firstName || "there";
  const subject = `Action needed — payment issue with your Pillar account`;
  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#ef4444;letter-spacing:1px;text-transform:uppercase;">Action required</p>
    <h1 style="margin:0 0 20px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.3;letter-spacing:-0.5px;">We couldn't process your payment.</h1>
    <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">
      Hi ${name}, we couldn't charge the card on file for <strong style="color:#ffffff;">${orgName}</strong>. Your account is still active — we just need you to update your payment method.
    </p>
    ${goldBtn("https://mypillar.co/dashboard/settings", "Update payment method")}
    ${divider()}
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.7;">If you think this is a mistake or need help, just reply to this email.</p>
  `;
  const text = `Hi ${name},\n\nWe couldn't process your payment for ${orgName}. Update your payment method at: https://mypillar.co/dashboard/settings\n\nQuestions? Reply to this email.\n\nPillar`;
  return send(to, subject, wrap(body));
}

// ─── Support Ticket Response ─────────────────────────────────────────────────

export async function sendSupportTicketResponse(to: string, firstName: string, subject: string, responseText: string): Promise<MailResult> {
  const name = firstName || "there";
  const emailSubject = `Re: ${subject}`;
  const paragraphs = responseText.split("\n").filter(Boolean).map(p => `<p style="margin:0 0 14px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">${p}</p>`).join("");
  const body = `
    <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">Hi ${name},</h1>
    ${paragraphs}
    ${divider()}
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.7;">
      Need more help? Reply to this email or visit <a href="https://mypillar.co/dashboard/help" style="color:#f59e0b;text-decoration:none;">your help center</a>.
    </p>
  `;
  const text = `Hi ${name},\n\n${responseText}\n\nNeed more help? Reply to this email.\n\nPillar`;
  return send(to, emailSubject, wrap(body));
}

// ─── Outreach Email ──────────────────────────────────────────────────────────

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
    ? `<p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">Hi ${name}, I sent a note a few days ago and wanted to follow up briefly.</p>`
    : `<p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">Hi ${name},</p>`;

  const bodyText = hasWebsite
    ? `<p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">I came across ${orgName} and noticed your website. A lot of ${orgType || "civic organizations"} we work with spend a lot of time keeping their sites updated, posting to social media, and managing their event calendar manually.</p>`
    : `<p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">I noticed ${orgName} doesn't appear to have a website yet. That's really common for ${orgType || "civic organizations"} — there's usually no one whose job it is to set one up.</p>`;

  const body = `
    ${intro}
    ${bodyText}
    <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">I run a platform called <strong style="color:#ffffff;">Pillar</strong> that handles all of that automatically — website, events, social media, board approvals — for about the cost of a dinner out each month.</p>
    <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">Is managing your org's digital presence something that takes more time than it should?</p>
    ${goldBtn("https://mypillar.co", "See how Pillar works")}
    ${divider()}
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.7;">Happy to send more info or just let you poke around free for 14 days. No card required.</p>
  `;
  const text = `Hi ${name},\n\nI run a platform called Pillar that handles website, events, social media, and board approvals automatically for civic organizations.\n\nIs managing ${orgName}'s digital presence something that takes more time than it should?\n\nSee how it works: https://mypillar.co\n\nHappy to chat or just let you try it free for 14 days.`;
  return send(to, subject, wrap(body));
}

// ─── Founder Digest ───────────────────────────────────────────────────────────

export async function sendFounderDigest(subject: string, bodyHtml: string, bodyText: string): Promise<MailResult> {
  return send(FOUNDER_EMAIL, subject, wrap(bodyHtml), bodyText);
}

// ─── Org Email (from their verified sender) ───────────────────────────────────

export async function sendOrgEmail(
  opts: {
    to: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    fromName: string;
    fromEmail: string;
  }
): Promise<MailResult> {
  const fromAddress = `${opts.fromName} <${opts.fromEmail}>`;
  return send(opts.to, opts.subject, opts.bodyHtml, opts.bodyText, fromAddress);
}


// ─── Ticket Confirmation ──────────────────────────────────────────────────────

export async function sendTicketConfirmation(opts: {
  to: string;
  attendeeName: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  quantity: number;
  amountPaidCents: number;
  confirmationId: string;
  orgName: string;
  accentColor?: string;
}): Promise<MailResult> {
  const {
    to, attendeeName, eventName, eventDate, eventTime, eventLocation,
    quantity, amountPaidCents, confirmationId, orgName,
  } = opts;
  const accent = opts.accentColor ?? "#f59e0b";
  const shortId = confirmationId.toUpperCase().slice(-8);
  const subject = `Your ${eventName} Tickets — Confirmation #${shortId}`;
  const totalDollars = (amountPaidCents / 100).toFixed(2);
  const perTicket = quantity > 0 ? (amountPaidCents / quantity / 100).toFixed(2) : "0.00";
  const isFree = amountPaidCents === 0;

  const metaRow = (label: string, value: string) =>
    value ? `<tr>
      <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);width:120px;font-size:13px;color:rgba(255,255,255,0.45);vertical-align:top;">${label}</td>
      <td style="padding:8px 0 8px 16px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px;color:rgba(255,255,255,0.85);vertical-align:top;">${value}</td>
    </tr>` : "";

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${accent};letter-spacing:1px;text-transform:uppercase;">Booking confirmed</p>
    <h1 style="margin:0 0 20px;font-size:26px;font-weight:800;color:#ffffff;line-height:1.25;letter-spacing:-0.5px;">You're going to ${eventName}.</h1>

    <p style="margin:0 0 20px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">
      Hi ${attendeeName}, your ${quantity === 1 ? "ticket is" : `${quantity} tickets are`} confirmed. See you there!
    </p>

    <!-- Confirmation number block -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;">
      <tr>
        <td style="background-color:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-left:4px solid ${accent};border-radius:10px;padding:20px 24px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.4);">Confirmation number</p>
          <p style="margin:0;font-size:28px;font-weight:800;color:${accent};letter-spacing:2px;font-family:monospace;">#${shortId}</p>
          <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.35);">Show this email at check-in.</p>
        </td>
      </tr>
    </table>

    <!-- Event details table -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;">
      ${metaRow("Event", eventName)}
      ${metaRow("Date", eventDate)}
      ${metaRow("Time", eventTime)}
      ${metaRow("Location", eventLocation)}
      ${metaRow("Tickets", String(quantity))}
      ${isFree ? metaRow("Total", "Free") : metaRow("Total", `$${totalDollars}${quantity > 1 ? ` ($${perTicket} each)` : ""}`)}
    </table>

    ${divider()}

    <p style="margin:0 0 6px;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.7;">
      Not seeing this email in your inbox? Check your <strong style="color:rgba(255,255,255,0.5);">spam or junk folder</strong>.
    </p>
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.7;">
      Questions? Contact ${orgName} directly or reply to this email.
    </p>
  `;

  const text = `Hi ${attendeeName},\n\nYou're confirmed for ${eventName}.\n\nConfirmation: #${shortId}\n\nEvent: ${eventName}\nDate: ${eventDate}\nTime: ${eventTime}\nLocation: ${eventLocation}\nTickets: ${quantity}\nTotal: ${isFree ? "Free" : `$${totalDollars}`}\n\nShow this email at check-in.\n\nNot in your inbox? Check spam/junk.\n\n${orgName}`;

  return send(to, subject, wrap(body, accent), text);
}

// ─── Generic transactional email ─────────────────────────────────────────────

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<MailResult> {
  return send(opts.to, opts.subject, opts.html, opts.text ?? opts.subject);
}
