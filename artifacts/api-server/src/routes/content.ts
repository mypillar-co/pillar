import { Router, type Request, type Response } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import { getSessionId } from "../lib/auth";

const router = Router();

function getOpenAIClient() {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("AI integration not configured");
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

async function resolveOrg(req: Request, res: Response) {
  const sessionId = getSessionId(req);
  if (!sessionId) { res.status(401).json({ error: "Not authenticated" }); return null; }
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return null; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.userId, userId));
  if (!org) { res.status(404).json({ error: "Organization not found" }); return null; }
  return org;
}

function isNewMonth(lastReset: Date): boolean {
  const now = new Date();
  return lastReset.getFullYear() < now.getFullYear() || lastReset.getMonth() < now.getMonth();
}

async function checkAndResetUsage(org: typeof organizationsTable.$inferSelect, res: Response) {
  let used = org.aiMessagesUsed ?? 0;
  if (isNewMonth(new Date(org.aiMessagesResetAt ?? 0))) {
    await db.update(organizationsTable)
      .set({ aiMessagesUsed: 0, aiMessagesResetAt: new Date() })
      .where(eq(organizationsTable.id, org.id));
    used = 0;
  }

  const MONTHLY_LIMITS: Record<string, number> = {
    tier1a: 20,
    tier2: 50,
    tier3: 100,
    tier4: 200,
    default: 10,
  };
  const MONTHLY_LIMIT = MONTHLY_LIMITS[org.tier ?? ""] ?? MONTHLY_LIMITS.default;

  if (used >= MONTHLY_LIMIT) {
    res.status(429).json({ error: `Monthly AI limit reached (${MONTHLY_LIMIT} tasks). Upgrade your plan for more.` });
    return null;
  }

  return { used, limit: MONTHLY_LIMIT };
}

type TaskConfig = {
  label: string;
  description: string;
  category: string;
  emoji: string;
  inputs: { key: string; label: string; placeholder: string; multiline?: boolean }[];
  buildPrompt: (inputs: Record<string, string>, orgName: string) => { system: string; user: string };
};

const TASKS: Record<string, TaskConfig> = {
  // ── Communications ─────────────────────────────────────────────
  press_release: {
    label: "Press Release",
    description: "Professional news release for media distribution",
    category: "communications",
    emoji: "📰",
    inputs: [
      { key: "headline", label: "News Headline", placeholder: "e.g., Local Chamber Announces Annual Awards Gala" },
      { key: "details", label: "Key Details", placeholder: "Date, location, what happened or is happening, why it matters...", multiline: true },
      { key: "quote", label: "Quote from Leadership (optional)", placeholder: "A quote from your president or director" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You are a PR writer for civic organizations. Write professional, media-ready press releases. Use AP style. Include: headline, dateline, lead paragraph (who/what/when/where/why), body paragraphs, optional quote, boilerplate "About ${org}", and ### end marker. Output only the press release text.`,
      user: `Write a press release for ${org}.\n\nHeadline: ${inp.headline}\nDetails: ${inp.details}${inp.quote ? `\nQuote: "${inp.quote}"` : ""}`,
    }),
  },

  newsletter_intro: {
    label: "Newsletter Intro",
    description: "Engaging opening paragraph for your monthly newsletter",
    category: "communications",
    emoji: "📬",
    inputs: [
      { key: "month", label: "Month / Period", placeholder: "e.g., March 2026" },
      { key: "highlights", label: "Key Highlights This Month", placeholder: "List 3-5 things that happened or are coming up...", multiline: true },
      { key: "tone", label: "Tone", placeholder: "e.g., warm and encouraging, formal, celebratory" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write newsletter intros for civic organizations. Create an engaging, warm opening section (150-250 words) that sets context for the newsletter. Use the highlights as springboards, not a list. Address members directly. End with a brief forward-looking sentence. Output only the newsletter intro text.`,
      user: `Newsletter intro for ${org} — ${inp.month}\nHighlights: ${inp.highlights}\nTone: ${inp.tone || "warm and professional"}`,
    }),
  },

  fundraising_appeal: {
    label: "Fundraising Appeal",
    description: "Compelling donation request letter or email",
    category: "communications",
    emoji: "💛",
    inputs: [
      { key: "cause", label: "What the Funds Support", placeholder: "e.g., annual scholarship fund, community center renovation" },
      { key: "goal", label: "Fundraising Goal (optional)", placeholder: "e.g., $10,000 by June 30" },
      { key: "impact", label: "Impact Statement", placeholder: "What has your org achieved? What will this enable?", multiline: true },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write fundraising appeals for civic organizations. Create an emotionally resonant, action-oriented appeal (200-300 words) that connects donors to real impact. Use specific details, a clear call to action, and a personal tone. Avoid generic corporate language. Output only the appeal letter text.`,
      user: `Fundraising appeal for ${org}\nCause: ${inp.cause}${inp.goal ? `\nGoal: ${inp.goal}` : ""}\nImpact: ${inp.impact}`,
    }),
  },

  thank_you_letter: {
    label: "Thank You Letter",
    description: "Sincere acknowledgment for donors, sponsors, or volunteers",
    category: "communications",
    emoji: "🤝",
    inputs: [
      { key: "recipient", label: "Recipient Name or Group", placeholder: "e.g., John Smith, or Our Volunteers" },
      { key: "occasion", label: "What You're Thanking Them For", placeholder: "e.g., $500 donation, 20 hours of volunteering at our gala" },
      { key: "impact", label: "Specific Impact (optional)", placeholder: "How did their contribution help?" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write heartfelt thank-you letters for civic organizations. Create a genuine, specific thank-you (150-200 words) that makes the recipient feel truly appreciated and connected to the mission. Avoid generic phrases. Reference the specific contribution. Output only the letter text.`,
      user: `Thank-you letter from ${org}\nRecipient: ${inp.recipient}\nFor: ${inp.occasion}${inp.impact ? `\nImpact: ${inp.impact}` : ""}`,
    }),
  },

  meeting_announcement: {
    label: "Meeting Announcement",
    description: "Formal notice with agenda for an upcoming meeting",
    category: "communications",
    emoji: "📋",
    inputs: [
      { key: "meetingType", label: "Meeting Type", placeholder: "e.g., Monthly Board Meeting, Annual General Meeting" },
      { key: "datetime", label: "Date & Time", placeholder: "e.g., Tuesday, April 8 at 7:00 PM" },
      { key: "location", label: "Location / Link", placeholder: "e.g., Town Hall Room 2B, or Zoom link" },
      { key: "agendaItems", label: "Agenda Items", placeholder: "List the agenda items, one per line...", multiline: true },
    ],
    buildPrompt: (inp, org) => ({
      system: `You draft formal meeting announcements for civic organizations. Create a clear, professional notice that includes all key details. Format the agenda neatly. Include RSVP or attendance instructions if implied. Keep it under 200 words. Output only the announcement text.`,
      user: `Meeting announcement for ${org}\nType: ${inp.meetingType}\nWhen: ${inp.datetime}\nWhere: ${inp.location}\nAgenda:\n${inp.agendaItems}`,
    }),
  },

  // ── Events ─────────────────────────────────────────────────────
  event_description: {
    label: "Event Description",
    description: "Compelling event copy for website, tickets, and promotion",
    category: "events",
    emoji: "🎉",
    inputs: [
      { key: "eventName", label: "Event Name", placeholder: "e.g., Spring Gala & Awards Ceremony" },
      { key: "details", label: "Event Details", placeholder: "Date, time, location, what will happen, who should attend...", multiline: true },
      { key: "callToAction", label: "Call to Action", placeholder: "e.g., Buy tickets, RSVP free, Sponsor a table" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write event descriptions for civic organizations. Create an exciting, informative description (150-200 words) that generates genuine enthusiasm and drives registrations. Start with a hook. Include all key logistics. End with a strong CTA. Output only the event description text.`,
      user: `Event description for ${org}\nEvent: ${inp.eventName}\nDetails: ${inp.details}\nCTA: ${inp.callToAction}`,
    }),
  },

  event_recap: {
    label: "Event Recap",
    description: "Post-event summary for newsletter, website, or social media",
    category: "events",
    emoji: "🏆",
    inputs: [
      { key: "eventName", label: "Event Name", placeholder: "e.g., Annual Charity Golf Tournament" },
      { key: "highlights", label: "What Happened", placeholder: "Key moments, speakers, winners, funds raised, attendance...", multiline: true },
      { key: "thanks", label: "Who to Thank (optional)", placeholder: "Sponsors, volunteers, keynote speakers..." },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write event recaps for civic organizations. Create a warm, celebratory summary (200-250 words) that captures the energy of the event and reinforces community pride. Highlight achievements and express gratitude. Great for newsletters and websites. Output only the recap text.`,
      user: `Event recap for ${org}\nEvent: ${inp.eventName}\nWhat happened: ${inp.highlights}${inp.thanks ? `\nThank: ${inp.thanks}` : ""}`,
    }),
  },

  volunteer_recruitment: {
    label: "Volunteer Recruitment",
    description: "Motivating post or email to attract new volunteers",
    category: "events",
    emoji: "🙋",
    inputs: [
      { key: "role", label: "Volunteer Role / Need", placeholder: "e.g., Event setup crew, committee members, event-day greeters" },
      { key: "commitment", label: "Time Commitment", placeholder: "e.g., 4 hours on Saturday May 10, or 2 hours/month" },
      { key: "perks", label: "What Volunteers Get (optional)", placeholder: "e.g., free admission, recognition, networking, satisfaction of giving back" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write volunteer recruitment posts for civic organizations. Create an enthusiastic, specific call to action (150-200 words) that makes volunteering sound rewarding and easy to commit to. Be specific about the role and time ask. Include a clear next step. Output only the recruitment text.`,
      user: `Volunteer recruitment for ${org}\nRole: ${inp.role}\nCommitment: ${inp.commitment}${inp.perks ? `\nBenefits: ${inp.perks}` : ""}`,
    }),
  },

  speaker_bio: {
    label: "Speaker Bio",
    description: "Professional bio for event programs, website, and intros",
    category: "events",
    emoji: "🎤",
    inputs: [
      { key: "name", label: "Speaker Name", placeholder: "e.g., Dr. Maria Santos" },
      { key: "role", label: "Title / Organization", placeholder: "e.g., Executive Director, City Housing Authority" },
      { key: "background", label: "Background & Talking Points", placeholder: "Experience, accomplishments, what they'll speak about...", multiline: true },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write professional speaker bios for civic events. Create a polished, third-person bio (100-150 words) that establishes credibility and builds audience anticipation. Highlight relevant experience and the specific value they bring to this event. Output only the bio text.`,
      user: `Speaker bio for ${inp.name}, presenting at a ${org} event\nTitle: ${inp.role}\nBackground: ${inp.background}`,
    }),
  },

  // ── Social Media ───────────────────────────────────────────────
  social_campaign: {
    label: "3-Post Social Campaign",
    description: "Three ready-to-post updates for Facebook, Instagram, and X",
    category: "social",
    emoji: "📣",
    inputs: [
      { key: "topic", label: "Topic or Event to Promote", placeholder: "e.g., Annual Awards Dinner on April 20" },
      { key: "goal", label: "What You Want People to Do", placeholder: "e.g., buy tickets, RSVP, show up, donate" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You create social media campaigns for civic organizations. Generate exactly 3 posts:\n1. FACEBOOK (up to 400 chars, community-focused, include a CTA)\n2. INSTAGRAM (up to 300 chars, visual and energetic, include 3-5 hashtags)\n3. X/TWITTER (under 280 chars, punchy, 1-2 hashtags)\n\nFormat each clearly with "FACEBOOK:", "INSTAGRAM:", "X:" labels. Output only the 3 posts.`,
      user: `3-post campaign for ${org}\nTopic: ${inp.topic}\nGoal: ${inp.goal}`,
    }),
  },

  monthly_highlights: {
    label: "Monthly Highlights Post",
    description: "Social post summarizing your organization's month",
    category: "social",
    emoji: "📅",
    inputs: [
      { key: "month", label: "Month", placeholder: "e.g., March 2026" },
      { key: "highlights", label: "Key Things That Happened", placeholder: "3-5 bullet points of events, milestones, news...", multiline: true },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write monthly recap social posts for civic organizations. Create an upbeat, community-building Facebook post (250-350 chars) that celebrates the month and teases what's next. Use an emoji or two naturally. End with engagement prompt. Output only the post text.`,
      user: `Monthly highlights post for ${org} — ${inp.month}\nHighlights:\n${inp.highlights}`,
    }),
  },

  milestone_post: {
    label: "Milestone Celebration Post",
    description: "Anniversary, achievement, or milestone announcement",
    category: "social",
    emoji: "🌟",
    inputs: [
      { key: "milestone", label: "The Milestone", placeholder: "e.g., 50th anniversary, raised $100K, 500 members, new building" },
      { key: "context", label: "Why It Matters", placeholder: "Brief history or significance of this achievement" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write milestone celebration posts for civic organizations. Create an emotionally resonant, pride-filled social post (200-300 chars) that makes members feel part of something meaningful. Celebrate the community that made it possible. Output only the post text.`,
      user: `Milestone post for ${org}\nMilestone: ${inp.milestone}\nContext: ${inp.context}`,
    }),
  },

  // ── Administration ─────────────────────────────────────────────
  meeting_minutes: {
    label: "Meeting Minutes",
    description: "Formatted minutes from your bullet-point notes",
    category: "admin",
    emoji: "📝",
    inputs: [
      { key: "meetingInfo", label: "Meeting Info", placeholder: "e.g., Board Meeting, March 15 2026, 7:00 PM, attendees: 12 members" },
      { key: "notes", label: "Raw Notes / Bullet Points", placeholder: "Paste your rough notes here — motions, decisions, action items...", multiline: true },
    ],
    buildPrompt: (inp, org) => ({
      system: `You format meeting minutes for civic organizations. Turn rough notes into clean, professional minutes with: header (org name, meeting type, date, time, attendees if provided), sections for each agenda item, clearly marked MOTIONS (Moved by / Seconded by / Result), ACTION ITEMS list at the end with owner and due date where implied. Output only the formatted minutes.`,
      user: `Format minutes for ${org}\nMeeting: ${inp.meetingInfo}\n\nRaw notes:\n${inp.notes}`,
    }),
  },

  grant_summary: {
    label: "Grant Program Summary",
    description: "One-page program description for grant applications",
    category: "admin",
    emoji: "📄",
    inputs: [
      { key: "programName", label: "Program or Initiative Name", placeholder: "e.g., Youth Leadership Scholarship" },
      { key: "description", label: "What the Program Does", placeholder: "Goals, who it serves, how it works, track record...", multiline: true },
      { key: "ask", label: "Funding Ask (optional)", placeholder: "e.g., $5,000 to fund 5 scholarships" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write grant program summaries for civic organizations. Create a concise, compelling one-page description (250-350 words) suitable for grant applications. Include: program overview, target population, theory of change, measurable outcomes, and why this organization is positioned to deliver. Professional but accessible language. Output only the program summary.`,
      user: `Grant program summary for ${org}\nProgram: ${inp.programName}\nDescription: ${inp.description}${inp.ask ? `\nFunding ask: ${inp.ask}` : ""}`,
    }),
  },

  volunteer_faq: {
    label: "Volunteer FAQ",
    description: "Q&A page for prospective volunteers",
    category: "admin",
    emoji: "❓",
    inputs: [
      { key: "roles", label: "Common Volunteer Roles", placeholder: "e.g., event setup, committee work, phone banking, tutoring" },
      { key: "requirements", label: "Any Requirements", placeholder: "e.g., 18+, background check, specific skills" },
      { key: "process", label: "How to Get Involved", placeholder: "Sign-up process, orientation, training..." },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write volunteer FAQ pages for civic organizations. Create 6-8 Q&A pairs covering the most common questions a prospective volunteer would have. Be specific, welcoming, and remove as many friction points as possible. Format as "Q: ... A: ..." pairs. Output only the FAQ content.`,
      user: `Volunteer FAQ for ${org}\nRoles: ${inp.roles}\nRequirements: ${inp.requirements}\nProcess: ${inp.process}`,
    }),
  },
};

const TIER_ALLOWS_CONTENT = new Set(["tier1a", "tier2", "tier3", "tier4"]);

// GET /api/content/tasks — list available tasks
router.get("/tasks", (req: Request, res: Response) => {
  const tasks = Object.entries(TASKS).map(([id, t]) => ({
    id,
    label: t.label,
    description: t.description,
    category: t.category,
    emoji: t.emoji,
    inputs: t.inputs.map(i => ({ key: i.key, label: i.label, placeholder: i.placeholder, multiline: i.multiline ?? false })),
  }));
  res.json({ tasks });
});

// POST /api/content/generate — generate content for a task
router.post("/generate", async (req: Request, res: Response) => {
  const org = await resolveOrg(req, res);
  if (!org) return;

  if (!TIER_ALLOWS_CONTENT.has(org.tier ?? "")) {
    res.status(403).json({ error: "Content Studio requires a Starter plan or higher" });
    return;
  }

  const usageInfo = await checkAndResetUsage(org, res);
  if (!usageInfo) return;
  const { used, limit } = usageInfo;

  const { taskId, inputs } = req.body as { taskId: string; inputs: Record<string, string> };

  const task = TASKS[taskId];
  if (!task) {
    res.status(400).json({ error: `Unknown task: ${taskId}` });
    return;
  }

  const missingInputs = task.inputs
    .filter(i => !i.label.includes("optional") && !inputs[i.key]?.trim())
    .map(i => i.label);
  if (missingInputs.length > 0) {
    res.status(400).json({ error: `Missing required fields: ${missingInputs.join(", ")}` });
    return;
  }

  try {
    const client = getOpenAIClient();
    const { system, user } = task.buildPrompt(inputs, org.name ?? "your organization");

    const completion = await client.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!content) {
      res.status(500).json({ error: "AI returned empty content. Please try again." });
      return;
    }

    await db.update(organizationsTable)
      .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` })
      .where(eq(organizationsTable.id, org.id));

    const newUsed = used + 1;
    res.json({ content, taskId, used: newUsed, limit, remaining: limit - newUsed });
  } catch {
    res.status(500).json({ error: "Content generation failed. Please try again." });
  }
});

export default router;
