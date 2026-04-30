/**
 * Pillar AI Agents
 * Four autonomous agents that handle operations while the founder is busy.
 *
 * Agent 1: Customer Success — welcome emails, nudges, trial reminders, support auto-response
 * Agent 2: Operations      — weekly founder digest, payment failure emails, pre-event reminders
 * Agent 3: Content         — generates Pillar marketing content drafts
 * Agent 4: Outreach        — drafts and sends cold outreach to prospects
 */

import {
  db,
  usersTable,
  organizationsTable,
  subscriptionsTable,
  sitesTable,
  supportTicketsTable,
  agentLogsTable,
  contentQueueTable,
  outreachProspectsTable,
  eventsTable,
  ticketSalesTable,
} from "@workspace/db";
import {
  eq, and, gte, lte, lt, isNull, isNotNull, sql, ne, desc,
} from "drizzle-orm";
import OpenAI from "openai";
import { logger } from "./lib/logger";
import { createOpenAIClient } from "./lib/openaiClient";
import {
  sendWelcomeEmail,
  sendWebsiteNudge,
  sendTrialEndingEmail,
  sendPaymentFailedEmail,
  sendSupportTicketResponse,
  sendOutreachEmail,
  sendFounderDigest,
  sendEventReminderToAttendee,
  sendEventAdminAlert,
} from "./mailer";

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL ?? "steward.ai.app@gmail.com";
const DAILY_OUTREACH_LIMIT = 40;

function getOpenAIClient(): OpenAI {
  return createOpenAIClient();
}

// ─── Logging helper ───────────────────────────────────────────────────────────

async function logAction(
  agentName: string,
  action: string,
  status: "success" | "error" | "skipped",
  opts: { targetId?: string; targetEmail?: string; details?: string } = {}
) {
  try {
    await db.insert(agentLogsTable).values({
      agentName, action, status,
      targetId: opts.targetId,
      targetEmail: opts.targetEmail,
      details: opts.details,
    });
  } catch (err) {
    logger.warn({ err }, "Failed to write agent log");
  }
}

async function alreadyDid(agentName: string, action: string, targetId: string): Promise<boolean> {
  const rows = await db
    .select({ id: agentLogsTable.id })
    .from(agentLogsTable)
    .where(and(
      eq(agentLogsTable.agentName, agentName),
      eq(agentLogsTable.action, action),
      eq(agentLogsTable.targetId, targetId),
      eq(agentLogsTable.status, "success"),
    ))
    .limit(1);
  return rows.length > 0;
}

async function countTodayActions(agentName: string, action: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentLogsTable)
    .where(and(
      eq(agentLogsTable.agentName, agentName),
      eq(agentLogsTable.action, action),
      gte(agentLogsTable.createdAt, startOfDay),
    ));
  return Number(rows[0]?.count ?? 0);
}

// ─── Agent 1: Customer Success ────────────────────────────────────────────────

export async function runCustomerSuccessAgent() {
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const h48ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const h96ago = new Date(now.getTime() - 96 * 60 * 60 * 1000);
  const h2ago = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const d2future = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const d3future = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  // 1. Welcome emails — any user who never got a successful welcome email.
  //    We check ALL users (not just last 24h) so that emails which previously
  //    failed (e.g. domain not verified in Resend) are retried automatically
  //    on the next agent run. Cap at 50 per run to avoid burst sending.
  const allUsersWithEmail = await db
    .select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName })
    .from(usersTable)
    .where(isNotNull(usersTable.email))
    .limit(500);

  let welcomeSent = 0;
  for (const user of allUsersWithEmail) {
    if (welcomeSent >= 50) break;
    if (!user.email) continue;
    if (await alreadyDid("customerSuccess", "welcome_email", user.id)) continue;

    const orgs = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.userId, user.id))
      .limit(1);
    const orgName = orgs[0]?.name ?? "your organization";

    const result = await sendWelcomeEmail(user.email, user.firstName ?? "", orgName);
    await logAction("customerSuccess", "welcome_email", result.sent || result.simulated ? "success" : "error", {
      targetId: user.id,
      targetEmail: user.email,
      details: result.simulated ? "simulated (no RESEND_API_KEY)" : result.error,
    });
    if (result.sent || result.simulated) welcomeSent++;
  }

  // 2. Website nudge — in trial 48–96h ago, still no site
  const trialNoSite = await db
    .select({
      userId: organizationsTable.userId,
      orgId: organizationsTable.id,
      orgName: organizationsTable.name,
    })
    .from(organizationsTable)
    .where(and(
      gte(organizationsTable.createdAt, h96ago),
      lt(organizationsTable.createdAt, h48ago),
      isNull(organizationsTable.tier),
    ));

  for (const org of trialNoSite) {
    if (await alreadyDid("customerSuccess", "website_nudge", org.orgId)) continue;

    const siteRows = await db
      .select({ id: sitesTable.id })
      .from(sitesTable)
      .where(eq(sitesTable.orgId, org.orgId))
      .limit(1);
    if (siteRows.length > 0) continue;

    const users = await db
      .select({ email: usersTable.email, firstName: usersTable.firstName })
      .from(usersTable)
      .where(eq(usersTable.id, org.userId))
      .limit(1);
    const user = users[0];
    if (!user?.email) continue;

    const result = await sendWebsiteNudge(user.email, user.firstName ?? "", org.orgName);
    await logAction("customerSuccess", "website_nudge", result.sent || result.simulated ? "success" : "error", {
      targetId: org.orgId,
      targetEmail: user.email,
      details: result.simulated ? "simulated" : result.error,
    });
  }

  // 3. Trial ending reminder — trialing subscriptions expiring within 2–3 days
  const expiringTrials = await db
    .select({
      id: subscriptionsTable.id,
      userId: subscriptionsTable.userId,
      orgId: subscriptionsTable.organizationId,
      endDate: subscriptionsTable.currentPeriodEnd,
    })
    .from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.status, "trialing"),
      gte(subscriptionsTable.currentPeriodEnd, now),
      lte(subscriptionsTable.currentPeriodEnd, d3future),
    ));

  for (const sub of expiringTrials) {
    const targetId = `trial_${sub.id}`;
    if (await alreadyDid("customerSuccess", "trial_ending_email", targetId)) continue;

    const users = await db
      .select({ email: usersTable.email, firstName: usersTable.firstName })
      .from(usersTable)
      .where(eq(usersTable.id, sub.userId))
      .limit(1);
    const user = users[0];
    if (!user?.email) continue;

    const orgs = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, sub.orgId ?? ""))
      .limit(1);
    const orgName = orgs[0]?.name ?? "your organization";
    const daysLeft = Math.max(1, Math.ceil((sub.endDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    const result = await sendTrialEndingEmail(user.email, user.firstName ?? "", orgName, daysLeft);
    await logAction("customerSuccess", "trial_ending_email", result.sent || result.simulated ? "success" : "error", {
      targetId,
      targetEmail: user.email,
      details: result.simulated ? "simulated" : result.error,
    });
  }

  // 4. Support ticket auto-response — open tickets > 2h with no adminNotes
  const openTickets = await db
    .select()
    .from(supportTicketsTable)
    .where(and(
      eq(supportTicketsTable.status, "open"),
      lt(supportTicketsTable.createdAt, h2ago),
      isNull(supportTicketsTable.adminNotes),
    ))
    .limit(5);

  if (openTickets.length > 0) {
    let openai: OpenAI | null = null;
    try { openai = getOpenAIClient(); } catch { openai = null; }

    for (const ticket of openTickets) {
      if (!openai || await alreadyDid("customerSuccess", "support_response", ticket.id)) continue;

      try {
        const message = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 600,
          messages: [
            {
              role: "system",
              content: `You are a helpful support agent for Pillar — a SaaS platform that helps civic organizations (HOAs, Masonic lodges, VFW posts, Rotary clubs, nonprofits, PTAs) manage their website, events, social media, board approvals, and contacts automatically.

Your job is to write a short, genuine, helpful email response to a support ticket. 
Rules:
- Write as a person, not a bot
- Be specific to what they described
- If it's a how-to question, give clear steps
- If it's a bug, acknowledge it, apologize briefly, and say it's been flagged
- Keep it under 150 words
- Do NOT include a greeting (we add that separately) or sign-off
- Return only the body text, no subject line`,
            },
            {
              role: "user",
              content: `Support ticket subject: "${ticket.subject}"\n\nTicket description:\n${ticket.description}`,
            },
          ],
        });

        const responseText = message.choices[0]?.message?.content?.trim() ?? "";
        if (!responseText) continue;

        await db.update(supportTicketsTable)
          .set({ adminNotes: `[AI auto-response sent]\n\n${responseText}`, status: "in_progress" })
          .where(eq(supportTicketsTable.id, ticket.id));

        if (ticket.userEmail) {
          const users = await db
            .select({ firstName: usersTable.firstName })
            .from(usersTable)
            .where(eq(usersTable.id, ticket.userId ?? ""))
            .limit(1);
          const firstName = users[0]?.firstName ?? "";
          const mailResult = await sendSupportTicketResponse(ticket.userEmail, firstName, ticket.subject, responseText);
          await logAction("customerSuccess", "support_response", "success", {
            targetId: ticket.id,
            targetEmail: ticket.userEmail,
            details: mailResult.simulated ? "simulated" : undefined,
          });
        }
      } catch (err) {
        await logAction("customerSuccess", "support_response", "error", {
          targetId: ticket.id,
          details: String(err),
        });
      }
    }
  }

  logger.info("[customerSuccess] Agent run complete");
}

// ─── Agent 2: Operations ──────────────────────────────────────────────────────

export async function runOperationsAgent() {
  const now = new Date();

  // 1. Weekly digest — send on Monday between 8–9am
  const isMonday = now.getDay() === 1;
  const isMorningWindow = now.getHours() >= 8 && now.getHours() < 9;
  const weeklyTargetId = `weekly_${now.getFullYear()}_${getISOWeek(now)}`;

  if (isMonday && isMorningWindow && !(await alreadyDid("operations", "weekly_digest", weeklyTargetId))) {
    try {
      const allSubs = await db.select().from(subscriptionsTable);
      const activeSubs = allSubs.filter(s => s.status === "active" || s.status === "trialing");
      const cancelledThisWeek = allSubs.filter(s => {
        if (!s.cancelledAt) return false;
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return s.cancelledAt >= weekAgo;
      });

      const TIER_PRICES: Record<string, number> = { tier1: 29, tier1a: 59, tier2: 99, tier3: 149 };
      const mrr = activeSubs.reduce((sum, s) => sum + (s.tierId ? (TIER_PRICES[s.tierId] ?? 0) : 0), 0);

      const openTickets = await db
        .select({ count: sql<number>`count(*)` })
        .from(supportTicketsTable)
        .where(eq(supportTicketsTable.status, "open"));
      const openTicketCount = Number(openTickets[0]?.count ?? 0);

      const newThisWeek = await db
        .select({ count: sql<number>`count(*)` })
        .from(subscriptionsTable)
        .where(gte(subscriptionsTable.createdAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)));
      const newCount = Number(newThisWeek[0]?.count ?? 0);

      const bodyHtml = `
        <p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#e8b84b;">Weekly Pillar Digest</p>
        <p style="margin:0 0 16px;">Here's how the week looked:</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#94a3b8;">MRR</td><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-weight:700;text-align:right;">$${mrr.toLocaleString()}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#94a3b8;">Active subscribers</td><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-weight:700;text-align:right;">${activeSubs.length}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#94a3b8;">New this week</td><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-weight:700;text-align:right;">${newCount}</td></tr>
          <tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:#94a3b8;">Cancelled this week</td><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-weight:700;text-align:right;">${cancelledThisWeek.length}</td></tr>
          <tr><td style="padding:12px 0;color:#94a3b8;">Open support tickets</td><td style="padding:12px 0;font-weight:700;text-align:right;">${openTicketCount}</td></tr>
        </table>
        <p style="margin:0;"><a href="https://mypillar.co/admin" style="background:#e8b84b;color:#0c1526;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">View admin panel →</a></p>
      `;
      const bodyText = `Weekly Pillar Digest\n\nMRR: $${mrr}\nActive subscribers: ${activeSubs.length}\nNew this week: ${newCount}\nCancelled: ${cancelledThisWeek.length}\nOpen tickets: ${openTicketCount}\n\nhttps://mypillar.co/admin`;

      const result = await sendFounderDigest("Pillar Weekly Digest", bodyHtml, bodyText);
      await logAction("operations", "weekly_digest", result.sent || result.simulated ? "success" : "error", {
        targetId: weeklyTargetId,
        targetEmail: FOUNDER_EMAIL,
        details: result.simulated ? "simulated" : result.error,
      });
    } catch (err) {
      await logAction("operations", "weekly_digest", "error", { details: String(err) });
    }
  }

  // 2. Failed payment emails — subscriptions with status past_due
  const pastDue = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.status, "past_due"));

  for (const sub of pastDue) {
    const targetId = `pastdue_${sub.id}`;
    if (await alreadyDid("operations", "payment_failed_email", targetId)) continue;

    const users = await db
      .select({ email: usersTable.email, firstName: usersTable.firstName })
      .from(usersTable)
      .where(eq(usersTable.id, sub.userId))
      .limit(1);
    const user = users[0];
    if (!user?.email) continue;

    const orgs = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, sub.organizationId ?? ""))
      .limit(1);
    const orgName = orgs[0]?.name ?? "your organization";

    const result = await sendPaymentFailedEmail(user.email, user.firstName ?? "", orgName);
    await logAction("operations", "payment_failed_email", result.sent || result.simulated ? "success" : "error", {
      targetId,
      targetEmail: user.email,
      details: result.simulated ? "simulated" : result.error,
    });
  }

  // 3. Pre-event reminders — 7 days before
  //    a) Email every paid ticket holder for each event happening in 7 days
  //    b) Notify the org admin once per event
  {
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const targetDate = sevenDaysOut.toISOString().split("T")[0]; // "YYYY-MM-DD"

    const upcoming = await db
      .select({
        id: eventsTable.id,
        name: eventsTable.name,
        orgId: eventsTable.orgId,
        startDate: eventsTable.startDate,
        startTime: eventsTable.startTime,
        endTime: eventsTable.endTime,
        location: eventsTable.location,
        isTicketed: eventsTable.isTicketed,
        status: eventsTable.status,
      })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.startDate, targetDate),
          eq(eventsTable.status, "published"),
          eq(eventsTable.isActive, true),
        )
      );

    for (const event of upcoming) {
      // — a) Ticket holder reminders ———————————————————————————————————————
      if (event.isTicketed) {
        const sales = await db
          .select({
            id: ticketSalesTable.id,
            attendeeName: ticketSalesTable.attendeeName,
            attendeeEmail: ticketSalesTable.attendeeEmail,
            quantity: ticketSalesTable.quantity,
          })
          .from(ticketSalesTable)
          .where(
            and(
              eq(ticketSalesTable.eventId, event.id),
              eq(ticketSalesTable.paymentStatus, "paid"),
            )
          );

        // Fetch org name once per event
        const orgRows = await db
          .select({ name: organizationsTable.name })
          .from(organizationsTable)
          .where(eq(organizationsTable.id, event.orgId))
          .limit(1);
        const orgName = orgRows[0]?.name ?? "the organizer";

        for (const sale of sales) {
          if (!sale.attendeeEmail) continue;
          const targetId = `preEvent7_ticket_${sale.id}`;
          if (await alreadyDid("operations", "pre_event_reminder", targetId)) continue;

          try {
            const result = await sendEventReminderToAttendee({
              to: sale.attendeeEmail,
              attendeeName: sale.attendeeName ?? "there",
              eventName: event.name,
              eventDate: event.startDate ?? targetDate,
              eventTime: event.startTime ?? "",
              eventLocation: event.location ?? "",
              daysAway: 7,
              orgName,
            });
            await logAction("operations", "pre_event_reminder", result.sent || result.simulated ? "success" : "error", {
              targetId,
              targetEmail: sale.attendeeEmail,
              details: result.simulated ? "simulated" : (result.error ?? undefined),
            });
          } catch (err) {
            await logAction("operations", "pre_event_reminder", "error", {
              targetId,
              details: String(err),
            });
          }
        }
      }

      // — b) Admin alert ——————————————————————————————————————————————————
      const adminTargetId = `preEvent7_admin_${event.id}`;
      if (!(await alreadyDid("operations", "pre_event_admin_alert", adminTargetId))) {
        try {
          // Find org admin: user who owns an active subscription for this org
          const subRows = await db
            .select({ userId: subscriptionsTable.userId })
            .from(subscriptionsTable)
            .where(eq(subscriptionsTable.organizationId, event.orgId))
            .limit(1);
          const adminUserId = subRows[0]?.userId;

          if (adminUserId) {
            const adminRows = await db
              .select({ email: usersTable.email, firstName: usersTable.firstName })
              .from(usersTable)
              .where(eq(usersTable.id, adminUserId))
              .limit(1);
            const admin = adminRows[0];

            if (admin?.email) {
              // Count paid tickets for summary
              const soldRows = await db
                .select({ count: sql<number>`sum(${ticketSalesTable.quantity})` })
                .from(ticketSalesTable)
                .where(
                  and(
                    eq(ticketSalesTable.eventId, event.id),
                    eq(ticketSalesTable.paymentStatus, "paid"),
                  )
                );
              const ticketsSold = Number(soldRows[0]?.count ?? 0);

              const orgRows2 = await db
                .select({ slug: organizationsTable.slug })
                .from(organizationsTable)
                .where(eq(organizationsTable.id, event.orgId))
                .limit(1);
              const orgSlug = orgRows2[0]?.slug ?? "";

              const result = await sendEventAdminAlert({
                to: admin.email,
                adminName: admin.firstName ?? "",
                eventName: event.name,
                eventDate: event.startDate ?? targetDate,
                eventTime: event.startTime ?? "",
                eventLocation: event.location ?? "",
                ticketsSold,
                daysAway: 7,
                orgSlug,
              });
              await logAction("operations", "pre_event_admin_alert", result.sent || result.simulated ? "success" : "error", {
                targetId: adminTargetId,
                targetEmail: admin.email,
                details: result.simulated ? "simulated" : (result.error ?? undefined),
              });
            }
          }
        } catch (err) {
          await logAction("operations", "pre_event_admin_alert", "error", {
            targetId: adminTargetId,
            details: String(err),
          });
        }
      }
    }
  }

  logger.info("[operations] Agent run complete");
}

// ─── Agent 3: Content ─────────────────────────────────────────────────────────

const CONTENT_ANGLES = [
  { angle: "problem", platform: "linkedin", prompt: "Write a LinkedIn post (under 200 words) that describes a frustrating problem that HOA board presidents, Masonic lodge secretaries, or civic org administrators face — managing their organization's website, events, and communications manually. Lead with the pain. Don't pitch anything. End with a thought-provoking question. No hashtags in the text — provide them separately." },
  { angle: "tip", platform: "facebook", prompt: "Write a Facebook post (under 150 words) with one practical tip for running a civic organization more efficiently. Topics: member communication, event planning, keeping a website updated, board decisions, newsletters. Be specific and useful. Friendly, peer-level tone. No hashtags in the text." },
  { angle: "feature", platform: "linkedin", prompt: "Write a LinkedIn post (under 180 words) showing how Pillar (mypillar.co) solves a specific operational problem for civic organizations — HOAs, lodges, VFW posts, PTAs, nonprofits. Focus on one feature: website automation, event management, social media scheduling, or board approvals. Show the before/after. No hype. Be concrete." },
  { angle: "story", platform: "facebook", prompt: "Write a short Facebook post (under 120 words) describing a scenario where a volunteer org administrator is overwhelmed with manual tasks — updating the website, posting to Facebook manually, sending newsletters — and how their life gets easier when it's all automated. Paint a picture. No product pitch in the first sentence." },
  { angle: "hook", platform: "twitter", prompt: "Write a Twitter/X post (under 280 characters) that hooks HOA or civic org administrators with a surprising stat, counterintuitive observation, or strong opinion about how volunteer-run organizations manage (or mismanage) their digital presence. Punchy. No hashtags." },
];

export async function runContentAgent() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetId = `content_${today.toISOString().split("T")[0]}`;
  if (await alreadyDid("content", "daily_content_batch", targetId)) return;

  let openai: OpenAI;
  try { openai = getOpenAIClient(); } catch { return; }

  const generated: string[] = [];
  for (const spec of CONTENT_ANGLES) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: "You write marketing content for Pillar — a SaaS platform for civic organizations. You write as a knowledgeable peer, not a brand. Never use the words: leverage, synergy, empower, solution, game-changer, seamless. Use plain, direct language.",
          },
          { role: "user", content: spec.prompt + "\n\nFormat: return ONLY the post text, then on a new line 'HASHTAGS:' followed by 3-4 relevant hashtags." },
        ],
      } as Parameters<typeof openai.chat.completions.create>[0]);

      const raw = response.choices[0]?.message?.content ?? "";
      const parts = raw.split(/HASHTAGS:/i);
      const content = (parts[0] ?? raw).trim();
      const hashtags = (parts[1] ?? "").trim();

      await db.insert(contentQueueTable).values({
        platform: spec.platform,
        angle: spec.angle,
        content,
        hashtags: hashtags || null,
        status: "draft",
      });
      generated.push(`${spec.platform}:${spec.angle}`);
    } catch (err) {
      logger.warn({ err }, `[content] Failed to generate ${spec.angle} post`);
    }
  }

  await logAction("content", "daily_content_batch", "success", {
    targetId,
    details: `Generated ${generated.length} posts: ${generated.join(", ")}`,
  });
  logger.info(`[content] Agent run complete — ${generated.length} posts generated`);
}

// ─── Agent 4: Outreach ────────────────────────────────────────────────────────

export async function runOutreachAgent() {
  const now = new Date();
  const todaySent = await countTodayActions("outreach", "outreach_email");
  if (todaySent >= DAILY_OUTREACH_LIMIT) return;

  let remaining = DAILY_OUTREACH_LIMIT - todaySent;

  // First outreach — pending prospects with no prior contact
  const pending = await db
    .select()
    .from(outreachProspectsTable)
    .where(and(
      eq(outreachProspectsTable.status, "pending"),
      isNull(outreachProspectsTable.lastContactedAt),
    ))
    .limit(remaining);

  for (const prospect of pending) {
    if (remaining <= 0) break;
    try {
      const result = await sendOutreachEmail(
        prospect.contactEmail,
        prospect.contactName ?? "",
        prospect.orgName,
        prospect.orgType ?? "civic organization",
        prospect.currentWebsite,
        false,
      );
      await db.update(outreachProspectsTable).set({
        status: "contacted",
        emailsSent: (prospect.emailsSent ?? 0) + 1,
        lastContactedAt: now,
      }).where(eq(outreachProspectsTable.id, prospect.id));
      await logAction("outreach", "outreach_email", result.sent || result.simulated ? "success" : "error", {
        targetId: prospect.id,
        targetEmail: prospect.contactEmail,
        details: result.simulated ? "simulated" : result.error,
      });
      remaining--;
    } catch (err) {
      await logAction("outreach", "outreach_email", "error", {
        targetId: prospect.id,
        details: String(err),
      });
    }
  }

  // Follow-up — contacted 4 days ago with 1 email sent, no reply
  const d4ago = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const d5ago = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  const followUp = await db
    .select()
    .from(outreachProspectsTable)
    .where(and(
      eq(outreachProspectsTable.status, "contacted"),
      lte(outreachProspectsTable.lastContactedAt, d4ago),
      gte(outreachProspectsTable.lastContactedAt, d5ago),
      eq(outreachProspectsTable.emailsSent, 1),
    ))
    .limit(remaining);

  for (const prospect of followUp) {
    if (remaining <= 0) break;
    try {
      const result = await sendOutreachEmail(
        prospect.contactEmail,
        prospect.contactName ?? "",
        prospect.orgName,
        prospect.orgType ?? "civic organization",
        prospect.currentWebsite,
        true,
      );
      await db.update(outreachProspectsTable).set({
        emailsSent: (prospect.emailsSent ?? 0) + 1,
        lastContactedAt: now,
      }).where(eq(outreachProspectsTable.id, prospect.id));
      await logAction("outreach", "outreach_email", result.sent || result.simulated ? "success" : "error", {
        targetId: prospect.id,
        targetEmail: prospect.contactEmail,
        details: `follow-up${result.simulated ? " (simulated)" : ""}`,
      });
      remaining--;
    } catch (err) {
      await logAction("outreach", "outreach_email", "error", { targetId: prospect.id, details: String(err) });
    }
  }

  // Mark no-response — contacted 10+ days ago with 2+ emails
  const d10ago = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  await db.update(outreachProspectsTable)
    .set({ status: "noresponse" })
    .where(and(
      eq(outreachProspectsTable.status, "contacted"),
      lte(outreachProspectsTable.lastContactedAt, d10ago),
      gte(outreachProspectsTable.emailsSent, 2),
    ));

  logger.info("[outreach] Agent run complete");
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
