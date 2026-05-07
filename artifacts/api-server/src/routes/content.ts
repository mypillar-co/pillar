import { Router, type Request, type Response } from "express";
import {
  db,
  membersTable,
  newsletterSubscribersTable,
  orgContactSubmissionsTable,
  organizationsTable,
  socialPostsTable,
  sponsorsTable,
  studioOutputsTable,
  vendorsTable,
} from "@workspace/db";
import { eq, sql, desc, and, isNotNull, isNull } from "drizzle-orm";
import OpenAI from "openai";
import { getSessionId } from "../lib/auth";
import { resolveFullOrg } from "../lib/resolveOrg";
import { createOpenAIClient } from "../lib/openaiClient";
import { sendEmail, type MailResult } from "../mailer";

const router = Router();

function getOpenAIClient() {
  return createOpenAIClient();
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
    tier1a: 20, tier2: 50, tier3: 100, tier4: 200, default: 10,
  };
  const limit = MONTHLY_LIMITS[org.tier ?? ""] ?? MONTHLY_LIMITS.default;
  if (used >= limit) {
    res.status(429).json({ error: `Monthly AI limit reached (${limit} tasks). Upgrade your plan for more.` });
    return null;
  }
  return { used, limit };
}

async function incrementUsage(orgId: string) {
  await db.update(organizationsTable)
    .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + 1` })
    .where(eq(organizationsTable.id, orgId));
}

async function saveOutput(orgId: string, taskId: string, taskLabel: string, category: string,
  inputs: Record<string, string>, output: string, packId?: string) {
  const firstInput = Object.values(inputs).find(v => v?.trim());
  const summary = firstInput ? firstInput.substring(0, 120) : "";
  await db.insert(studioOutputsTable).values({
    orgId, taskId, taskLabel, category,
    inputSummary: summary,
    output,
    packId: packId ?? null,
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

type TaskConfig = {
  label: string;
  description: string;
  category: string;
  emoji: string;
  timeSaved: string;
  inputs: { key: string; label: string; placeholder: string; multiline?: boolean }[];
  buildPrompt: (inputs: Record<string, string>, orgName: string) => { system: string; user: string };
};

type PackTaskDef = {
  taskId: string;
  label: string;
  buildPrompt: (inputs: Record<string, string>, orgName: string) => { system: string; user: string };
};

type PackConfig = {
  label: string;
  description: string;
  emoji: string;
  timeSaved: string;
  includes: string[];
  inputs: { key: string; label: string; placeholder: string; multiline?: boolean }[];
  tasks: PackTaskDef[];
};

// ── Individual Tasks ─────────────────────────────────────────────────────────

const TASKS: Record<string, TaskConfig> = {

  // ── Communications ─────────────────────────────────────────────
  press_release: {
    label: "Press Release",
    description: "Professional news release for media distribution",
    category: "communications",
    emoji: "📰",
    timeSaved: "~45 min",
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
    timeSaved: "~30 min",
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
    timeSaved: "~1 hour",
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
    timeSaved: "~20 min",
    inputs: [
      { key: "recipient", label: "Recipient Name or Group", placeholder: "e.g., John Smith, or Our Volunteers" },
      { key: "occasion", label: "What You're Thanking Them For", placeholder: "e.g., $500 donation, 20 hours volunteering at our gala" },
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
    timeSaved: "~15 min",
    inputs: [
      { key: "meetingType", label: "Meeting Type", placeholder: "e.g., Monthly Board Meeting, Annual General Meeting" },
      { key: "datetime", label: "Date & Time", placeholder: "e.g., Tuesday, April 8 at 7:00 PM" },
      { key: "location", label: "Location / Link", placeholder: "e.g., Town Hall Room 2B, or Zoom link" },
      { key: "agendaItems", label: "Agenda Items", placeholder: "List the agenda items, one per line...", multiline: true },
    ],
    buildPrompt: (inp, org) => ({
      system: `You draft formal meeting announcements for civic organizations. Create a clear, professional notice that includes all key details. Format the agenda neatly. Keep it under 200 words. Output only the announcement text.`,
      user: `Meeting announcement for ${org}\nType: ${inp.meetingType}\nWhen: ${inp.datetime}\nWhere: ${inp.location}\nAgenda:\n${inp.agendaItems}`,
    }),
  },

  // ── Events ─────────────────────────────────────────────────────
  event_description: {
    label: "Event Description",
    description: "Compelling event copy for website, tickets, and promotion",
    category: "events",
    emoji: "🎉",
    timeSaved: "~30 min",
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
    timeSaved: "~30 min",
    inputs: [
      { key: "eventName", label: "Event Name", placeholder: "e.g., Annual Charity Golf Tournament" },
      { key: "highlights", label: "What Happened", placeholder: "Key moments, speakers, winners, funds raised, attendance...", multiline: true },
      { key: "thanks", label: "Who to Thank (optional)", placeholder: "Sponsors, volunteers, keynote speakers..." },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write event recaps for civic organizations. Create a warm, celebratory summary (200-250 words) that captures the energy of the event and reinforces community pride. Highlight achievements and express gratitude. Output only the recap text.`,
      user: `Event recap for ${org}\nEvent: ${inp.eventName}\nWhat happened: ${inp.highlights}${inp.thanks ? `\nThank: ${inp.thanks}` : ""}`,
    }),
  },

  volunteer_recruitment: {
    label: "Volunteer Recruitment",
    description: "Motivating post or email to attract new volunteers",
    category: "events",
    emoji: "🙋",
    timeSaved: "~20 min",
    inputs: [
      { key: "role", label: "Volunteer Role / Need", placeholder: "e.g., Event setup crew, committee members, event-day greeters" },
      { key: "commitment", label: "Time Commitment", placeholder: "e.g., 4 hours on Saturday May 10, or 2 hours/month" },
      { key: "perks", label: "What Volunteers Get (optional)", placeholder: "e.g., free admission, recognition, networking" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write volunteer recruitment posts for civic organizations. Create an enthusiastic, specific call to action (150-200 words) that makes volunteering sound rewarding and easy to commit to. Be specific about the role and time ask. Include a clear next step. Output only the recruitment text.`,
      user: `Volunteer recruitment for ${org}\nRole: ${inp.role}\nCommitment: ${inp.commitment}${inp.perks ? `\nBenefits: ${inp.perks}` : ""}`,
    }),
  },

  member_spotlight: {
    label: "Member / Volunteer Spotlight",
    description: "Feature a member, volunteer, or board member for newsletter or website",
    category: "events",
    emoji: "⭐",
    timeSaved: "~25 min",
    inputs: [
      { key: "name", label: "Person's Name", placeholder: "e.g., Maria Santos" },
      { key: "role", label: "Their Role", placeholder: "e.g., Board Treasurer, 10-year volunteer, Committee Chair" },
      { key: "background", label: "Background & Why They're Being Highlighted", placeholder: "Their involvement, accomplishments, why they matter to the org...", multiline: true },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write member spotlights for civic organizations. Create a warm, human-interest profile (150-200 words) in third person that celebrates this person's contribution and inspires other members. Make it feel personal and authentic, not like a resume. Output only the spotlight text.`,
      user: `Member spotlight for ${org}\nPerson: ${inp.name}\nRole: ${inp.role}\nBackground: ${inp.background}`,
    }),
  },

  // ── Social Media ──────────────────────────────────────────────
  social_campaign: {
    label: "3-Post Social Campaign",
    description: "Three ready-to-post updates for Facebook, Instagram, and X",
    category: "social",
    emoji: "📣",
    timeSaved: "~1 hour",
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
    timeSaved: "~20 min",
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
    timeSaved: "~15 min",
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
    timeSaved: "~45 min",
    inputs: [
      { key: "meetingInfo", label: "Meeting Info", placeholder: "e.g., Board Meeting, March 15 2026, 7:00 PM, 12 members" },
      { key: "notes", label: "Raw Notes / Bullet Points", placeholder: "Paste your rough notes — motions, decisions, action items...", multiline: true },
    ],
    buildPrompt: (inp, org) => ({
      system: `You format meeting minutes for civic organizations. Turn rough notes into clean, professional minutes with: header (org name, meeting type, date, time), sections for each agenda item, clearly marked MOTIONS (Moved by / Seconded by / Result), ACTION ITEMS list at the end. Output only the formatted minutes.`,
      user: `Format minutes for ${org}\nMeeting: ${inp.meetingInfo}\n\nRaw notes:\n${inp.notes}`,
    }),
  },

  grant_summary: {
    label: "Grant Program Summary",
    description: "One-page program description for grant applications",
    category: "admin",
    emoji: "📄",
    timeSaved: "~1.5 hours",
    inputs: [
      { key: "programName", label: "Program or Initiative Name", placeholder: "e.g., Youth Leadership Scholarship" },
      { key: "description", label: "What the Program Does", placeholder: "Goals, who it serves, how it works, track record...", multiline: true },
      { key: "ask", label: "Funding Ask (optional)", placeholder: "e.g., $5,000 to fund 5 scholarships" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write grant program summaries for civic organizations. Create a concise, compelling one-page description (250-350 words) suitable for grant applications. Include: program overview, target population, theory of change, measurable outcomes, and why this organization is positioned to deliver. Output only the program summary.`,
      user: `Grant program summary for ${org}\nProgram: ${inp.programName}\nDescription: ${inp.description}${inp.ask ? `\nFunding ask: ${inp.ask}` : ""}`,
    }),
  },

  volunteer_faq: {
    label: "Volunteer FAQ",
    description: "Q&A page for prospective volunteers",
    category: "admin",
    emoji: "❓",
    timeSaved: "~30 min",
    inputs: [
      { key: "roles", label: "Common Volunteer Roles", placeholder: "e.g., event setup, committee work, phone banking" },
      { key: "requirements", label: "Any Requirements", placeholder: "e.g., 18+, background check, specific skills" },
      { key: "process", label: "How to Get Involved", placeholder: "Sign-up process, orientation, training..." },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write volunteer FAQ pages for civic organizations. Create 6-8 Q&A pairs covering the most common questions a prospective volunteer would have. Be specific, welcoming. Format as "Q: ... A: ..." pairs. Output only the FAQ content.`,
      user: `Volunteer FAQ for ${org}\nRoles: ${inp.roles}\nRequirements: ${inp.requirements}\nProcess: ${inp.process}`,
    }),
  },

  // ── Repurposing ─────────────────────────────────────────────────
  content_to_social: {
    label: "Content → Social Posts",
    description: "Turn any existing content into 3 platform-ready social posts",
    category: "repurposing",
    emoji: "↩️",
    timeSaved: "~30 min",
    inputs: [
      { key: "content", label: "Source Content", placeholder: "Paste your press release, article, email, announcement, or any text...", multiline: true },
      { key: "goal", label: "Goal", placeholder: "e.g., drive ticket sales, announce news, recruit volunteers" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You repurpose written content into social media posts for civic organizations. Generate exactly 3 posts from the provided source material:\n1. FACEBOOK (up to 400 chars, community tone)\n2. INSTAGRAM (up to 300 chars, energetic, 3-5 hashtags)\n3. X/TWITTER (under 280 chars, punchy, 1-2 hashtags)\n\nExtract the most compelling angle from the source. Don't copy verbatim — adapt for each platform. Label each "FACEBOOK:", "INSTAGRAM:", "X:". Output only the 3 posts.`,
      user: `Repurpose for ${org}\nGoal: ${inp.goal}\n\nSource content:\n${inp.content}`,
    }),
  },

  minutes_to_newsletter: {
    label: "Meeting Minutes → Newsletter",
    description: "Transform dry minutes into a readable member update",
    category: "repurposing",
    emoji: "📄→📬",
    timeSaved: "~30 min",
    inputs: [
      { key: "minutes", label: "Meeting Minutes or Notes", placeholder: "Paste your meeting minutes or notes...", multiline: true },
      { key: "audience", label: "Audience", placeholder: "e.g., general members, donors, the public" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You transform meeting minutes into engaging member newsletter summaries for civic organizations. Convert formal minutes into a warm, readable 200-250 word update that keeps members informed without overwhelming them. Highlight key decisions, upcoming actions, and anything that affects members directly. Skip procedural details. Output only the newsletter section text.`,
      user: `Convert these ${org} meeting minutes into a member newsletter section.\nAudience: ${inp.audience}\n\nMinutes:\n${inp.minutes}`,
    }),
  },

  event_to_blog: {
    label: "Event Recap → Blog Post",
    description: "Turn event notes into a full website blog post",
    category: "repurposing",
    emoji: "🗒️→✍️",
    timeSaved: "~45 min",
    inputs: [
      { key: "eventName", label: "Event Name", placeholder: "e.g., Spring Fundraising Gala" },
      { key: "notes", label: "Event Notes / Highlights", placeholder: "What happened, attendance, highlights, quotes, funds raised...", multiline: true },
      { key: "cta", label: "Closing Call to Action (optional)", placeholder: "e.g., Save the date for next year, join our mailing list" },
    ],
    buildPrompt: (inp, org) => ({
      system: `You write blog posts for civic organization websites. Transform event notes into a polished, celebratory blog post (300-400 words) suitable for posting on the org website. Include an engaging headline, narrative intro, event highlights as flowing paragraphs (not bullets), key achievements, thank-yous, and a closing CTA. Output only the blog post text including a headline.`,
      user: `Blog post for ${org} about: ${inp.eventName}\nNotes: ${inp.notes}${inp.cta ? `\nCTA: ${inp.cta}` : ""}`,
    }),
  },

  release_to_snippets: {
    label: "Press Release → Snippets",
    description: "Pull social-ready quotes and hooks from a press release",
    category: "repurposing",
    emoji: "✂️",
    timeSaved: "~20 min",
    inputs: [
      { key: "release", label: "Press Release Text", placeholder: "Paste your full press release...", multiline: true },
    ],
    buildPrompt: (inp, org) => ({
      system: `You extract social media content from press releases for civic organizations. From the provided press release, generate: 1 punchy tweet-length announcement (under 280 chars), 1 Facebook-length post with context (under 400 chars), 1 pull quote highlighted in quotation marks (the most impactful sentence from the release), and 3 relevant hashtags. Label each section clearly. Output only the snippets.`,
      user: `Extract social snippets from this ${org} press release:\n\n${inp.release}`,
    }),
  },
};

// ── Content Packs (multi-step generation) ────────────────────────────────────

const PACKS: Record<string, PackConfig> = {

  event_launch: {
    label: "Event Launch Pack",
    description: "Everything you need to promote a new event — in one go",
    emoji: "🚀",
    timeSaved: "~2 hours",
    includes: ["Event Description", "3-Post Social Campaign", "Volunteer Recruitment"],
    inputs: [
      { key: "eventName", label: "Event Name", placeholder: "e.g., Annual Spring Gala & Awards" },
      { key: "datetime", label: "Date & Time", placeholder: "e.g., Saturday, May 10 at 6:30 PM" },
      { key: "location", label: "Location", placeholder: "e.g., Riverside Community Center" },
      { key: "details", label: "What's Happening / Why People Should Come", placeholder: "Key highlights, speakers, activities, cause...", multiline: true },
      { key: "cta", label: "Primary Call to Action", placeholder: "e.g., Buy tickets, RSVP by May 1, Sponsor a table" },
    ],
    tasks: [
      {
        taskId: "event_description",
        label: "Event Description",
        buildPrompt: (inp, org) => ({
          system: `You write event descriptions for civic organizations. Create an exciting, informative description (150-200 words) that generates genuine enthusiasm and drives registrations. Start with a hook. Include all key logistics. End with a strong CTA. Output only the event description text.`,
          user: `Event description for ${org}\nEvent: ${inp.eventName}\nDate/Time: ${inp.datetime}\nLocation: ${inp.location}\nDetails: ${inp.details}\nCTA: ${inp.cta}`,
        }),
      },
      {
        taskId: "social_campaign",
        label: "3-Post Social Campaign",
        buildPrompt: (inp, org) => ({
          system: `You create social media campaigns for civic organizations. Generate exactly 3 posts:\n1. FACEBOOK (up to 400 chars, community-focused, include CTA)\n2. INSTAGRAM (up to 300 chars, visual and energetic, 3-5 hashtags)\n3. X/TWITTER (under 280 chars, punchy, 1-2 hashtags)\nLabel each clearly with "FACEBOOK:", "INSTAGRAM:", "X:". Output only the 3 posts.`,
          user: `Promote this ${org} event: ${inp.eventName} on ${inp.datetime} at ${inp.location}. ${inp.details}. Goal: ${inp.cta}`,
        }),
      },
      {
        taskId: "volunteer_recruitment",
        label: "Volunteer Recruitment Post",
        buildPrompt: (inp, org) => ({
          system: `You write volunteer recruitment posts for civic organizations. Create an enthusiastic, specific call to action (150-200 words) that makes volunteering sound rewarding and easy. Include a clear next step. Output only the recruitment text.`,
          user: `Volunteer recruitment for ${org}'s event: ${inp.eventName} on ${inp.datetime} at ${inp.location}. Volunteers needed for event-day support. Time commitment: ${inp.datetime}.`,
        }),
      },
    ],
  },

  monthly_comms: {
    label: "Monthly Communications Pack",
    description: "Newsletter intro, social highlights, and meeting notice — all at once",
    emoji: "📅",
    timeSaved: "~1.5 hours",
    includes: ["Newsletter Intro", "Monthly Social Post", "Meeting Announcement"],
    inputs: [
      { key: "month", label: "Month / Period", placeholder: "e.g., April 2026" },
      { key: "highlights", label: "Key Things That Happened This Month", placeholder: "3-5 bullet points — events, milestones, news...", multiline: true },
      { key: "meetingDate", label: "Next Meeting Date & Time", placeholder: "e.g., Tuesday, May 6 at 7:00 PM" },
      { key: "meetingLocation", label: "Meeting Location / Link", placeholder: "e.g., Town Hall Room 2B, or Zoom link" },
      { key: "agendaItems", label: "Agenda Items (optional)", placeholder: "What will be discussed at the meeting..." },
    ],
    tasks: [
      {
        taskId: "newsletter_intro",
        label: "Newsletter Intro",
        buildPrompt: (inp, org) => ({
          system: `You write newsletter intros for civic organizations. Create an engaging, warm opening section (150-250 words) that sets context for the newsletter. Use highlights as springboards, not a list. Address members directly. End with a forward-looking sentence. Output only the newsletter intro text.`,
          user: `Newsletter intro for ${org} — ${inp.month}\nHighlights: ${inp.highlights}`,
        }),
      },
      {
        taskId: "monthly_highlights",
        label: "Monthly Social Post",
        buildPrompt: (inp, org) => ({
          system: `You write monthly recap social posts for civic organizations. Create an upbeat Facebook post (250-350 chars) that celebrates the month and teases what's next. Use an emoji or two. End with an engagement prompt. Output only the post text.`,
          user: `Monthly highlights post for ${org} — ${inp.month}\nHighlights:\n${inp.highlights}`,
        }),
      },
      {
        taskId: "meeting_announcement",
        label: "Meeting Announcement",
        buildPrompt: (inp, org) => ({
          system: `You draft formal meeting announcements for civic organizations. Create a clear, professional notice. Format the agenda neatly. Keep under 200 words. Output only the announcement text.`,
          user: `Meeting announcement for ${org}\nWhen: ${inp.meetingDate}\nWhere: ${inp.meetingLocation}${inp.agendaItems ? `\nAgenda:\n${inp.agendaItems}` : ""}`,
        }),
      },
    ],
  },

  fundraising_campaign: {
    label: "Fundraising Campaign Pack",
    description: "Appeal letter, donor thank-you, and social post — complete campaign",
    emoji: "💛",
    timeSaved: "~2 hours",
    includes: ["Fundraising Appeal", "Thank You Letter", "Social Campaign Post"],
    inputs: [
      { key: "cause", label: "What the Funds Support", placeholder: "e.g., annual scholarship fund, community garden expansion" },
      { key: "goal", label: "Fundraising Goal & Deadline", placeholder: "e.g., $15,000 by May 31" },
      { key: "impact", label: "Impact Statement", placeholder: "What has your org achieved? What will these funds enable?", multiline: true },
    ],
    tasks: [
      {
        taskId: "fundraising_appeal",
        label: "Fundraising Appeal",
        buildPrompt: (inp, org) => ({
          system: `You write fundraising appeals for civic organizations. Create an emotionally resonant, action-oriented appeal (200-300 words) that connects donors to real impact. Use specific details, a clear CTA, and personal tone. Output only the appeal letter text.`,
          user: `Fundraising appeal for ${org}\nCause: ${inp.cause}\nGoal: ${inp.goal}\nImpact: ${inp.impact}`,
        }),
      },
      {
        taskId: "thank_you_letter",
        label: "Donor Thank You Letter",
        buildPrompt: (inp, org) => ({
          system: `You write donor thank-you letters for civic organizations. Create a heartfelt, specific thank-you template (150-200 words) that can be personalized. Use [DONOR NAME] and [AMOUNT] as placeholders. Make the donor feel genuinely appreciated and connected to the mission. Output only the letter text.`,
          user: `Thank-you letter template from ${org}\nFor: donating to our ${inp.cause}\nImpact of their gift: ${inp.impact}`,
        }),
      },
      {
        taskId: "milestone_post",
        label: "Fundraising Social Post",
        buildPrompt: (inp, org) => ({
          system: `You write fundraising social posts for civic organizations. Create an urgent, emotionally compelling Facebook post (300-400 chars) that makes people want to give. Reference the cause and goal. Include a clear CTA. Output only the post text.`,
          user: `Fundraising social post for ${org}\nCause: ${inp.cause}\nGoal: ${inp.goal}\nImpact: ${inp.impact}`,
        }),
      },
    ],
  },
};

// ── Tier checks ───────────────────────────────────────────────────────────────

const TIER_ALLOWS_CONTENT = new Set(["tier1a", "tier2", "tier3", "tier4"]);
const TIER_ALLOWS_SOCIAL = new Set(["tier1a", "tier2", "tier3"]);
const CONTENT_AUDIENCES = new Set(["newsletter", "members", "sponsors", "vendors", "contacts"]);
const SOCIAL_PLATFORMS = new Set(["facebook", "twitter", "instagram", "buffer_facebook", "buffer_twitter", "buffer_instagram", "buffer_linkedin"]);

type ContentAudience = "newsletter" | "members" | "sponsors" | "vendors" | "contacts";

type DeliveryRecipient = {
  email: string;
  name: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanEmail(value: unknown): string {
  const candidate = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function dedupeRecipients(rows: DeliveryRecipient[]): DeliveryRecipient[] {
  const seen = new Set<string>();
  const result: DeliveryRecipient[] = [];
  for (const row of rows) {
    const email = cleanEmail(row.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    result.push({ email, name: row.name || email });
  }
  return result;
}

async function resolveContentRecipients(orgId: string, audience: ContentAudience): Promise<DeliveryRecipient[]> {
  if (audience === "newsletter") {
    const rows = await db
      .select({ email: newsletterSubscribersTable.email, name: newsletterSubscribersTable.name })
      .from(newsletterSubscribersTable)
      .where(and(eq(newsletterSubscribersTable.orgId, orgId), isNull(newsletterSubscribersTable.unsubscribedAt)))
      .orderBy(desc(newsletterSubscribersTable.subscribedAt))
      .limit(250);
    return dedupeRecipients(rows.map((row) => ({ email: row.email, name: row.name ?? row.email })));
  }

  if (audience === "members") {
    const rows = await db
      .select({ email: membersTable.email, firstName: membersTable.firstName, lastName: membersTable.lastName })
      .from(membersTable)
      .where(and(eq(membersTable.orgId, orgId), eq(membersTable.status, "active"), isNotNull(membersTable.email)))
      .orderBy(desc(membersTable.createdAt))
      .limit(250);
    return dedupeRecipients(rows.map((row) => ({
      email: row.email ?? "",
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || "",
    })));
  }

  if (audience === "sponsors") {
    const rows = await db
      .select({ email: sponsorsTable.email, name: sponsorsTable.name })
      .from(sponsorsTable)
      .where(and(eq(sponsorsTable.orgId, orgId), eq(sponsorsTable.status, "active"), isNotNull(sponsorsTable.email)))
      .orderBy(desc(sponsorsTable.createdAt))
      .limit(250);
    return dedupeRecipients(rows.map((row) => ({ email: row.email ?? "", name: row.name })));
  }

  if (audience === "vendors") {
    const rows = await db
      .select({ email: vendorsTable.email, name: vendorsTable.name })
      .from(vendorsTable)
      .where(and(eq(vendorsTable.orgId, orgId), eq(vendorsTable.status, "active"), isNotNull(vendorsTable.email)))
      .orderBy(desc(vendorsTable.createdAt))
      .limit(250);
    return dedupeRecipients(rows.map((row) => ({ email: row.email ?? "", name: row.name })));
  }

  const rows = await db
    .select({ email: orgContactSubmissionsTable.email, name: orgContactSubmissionsTable.name })
    .from(orgContactSubmissionsTable)
    .where(eq(orgContactSubmissionsTable.orgId, orgId))
    .orderBy(desc(orgContactSubmissionsTable.createdAt))
    .limit(250);
  return dedupeRecipients(rows.map((row) => ({ email: row.email, name: row.name })));
}

function audienceLabel(audience: ContentAudience): string {
  const labels: Record<ContentAudience, string> = {
    newsletter: "newsletter subscribers",
    members: "active members",
    sponsors: "active sponsors",
    vendors: "active vendors",
    contacts: "recent contacts",
  };
  return labels[audience];
}

function normalizePlatforms(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const platforms = input.map((p) => text(p)).filter((p) => SOCIAL_PLATFORMS.has(p));
  return Array.from(new Set(platforms));
}

function tierAllowsSocial(tier: string | null | undefined): boolean {
  return TIER_ALLOWS_SOCIAL.has(tier ?? "");
}

function splitSocialSections(content: string): Array<{ platform: string; content: string }> {
  const matches = [...content.matchAll(/(?:^|\n)\s*(FACEBOOK|INSTAGRAM|X\/TWITTER|TWITTER|X):\s*/gi)];
  if (!matches.length) return [];

  const sections: Array<{ platform: string; content: string }> = [];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const next = matches[i + 1];
    const label = (match[1] ?? "").toLowerCase();
    const platform = label.includes("facebook") ? "facebook"
      : label.includes("instagram") ? "instagram"
      : "twitter";
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? content.length;
    const sectionContent = content.slice(start, end).trim();
    if (sectionContent) sections.push({ platform, content: sectionContent });
  }
  return sections;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/content/tasks
router.get("/tasks", (_req: Request, res: Response) => {
  const tasks = Object.entries(TASKS).map(([id, t]) => ({
    id,
    label: t.label,
    description: t.description,
    category: t.category,
    emoji: t.emoji,
    timeSaved: t.timeSaved,
    inputs: t.inputs.map(i => ({ key: i.key, label: i.label, placeholder: i.placeholder, multiline: i.multiline ?? false })),
  }));
  res.json({ tasks });
});

// GET /api/content/packs
router.get("/packs", (_req: Request, res: Response) => {
  const packs = Object.entries(PACKS).map(([id, p]) => ({
    id,
    label: p.label,
    description: p.description,
    emoji: p.emoji,
    timeSaved: p.timeSaved,
    includes: p.includes,
    inputs: p.inputs.map(i => ({ key: i.key, label: i.label, placeholder: i.placeholder, multiline: i.multiline ?? false })),
  }));
  res.json({ packs });
});

// POST /api/content/generate
router.post("/generate", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!TIER_ALLOWS_CONTENT.has(org.tier ?? "")) {
    res.status(403).json({ error: "Content Studio requires a Starter plan or higher" });
    return;
  }

  const usageInfo = await checkAndResetUsage(org, res);
  if (!usageInfo) return;

  const { taskId, inputs } = req.body as { taskId: string; inputs: Record<string, string> };
  const task = TASKS[taskId];
  if (!task) { res.status(400).json({ error: `Unknown task: ${taskId}` }); return; }

  const missingInputs = task.inputs
    .filter(i => !i.label.toLowerCase().includes("optional") && !inputs[i.key]?.trim())
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
    if (!content) { res.status(500).json({ error: "AI returned empty content. Please try again." }); return; }

    await Promise.all([
      incrementUsage(org.id),
      saveOutput(org.id, taskId, task.label, task.category, inputs, content),
    ]);

    const newUsed = usageInfo.used + 1;
    res.json({ content, taskId, used: newUsed, limit: usageInfo.limit, remaining: usageInfo.limit - newUsed });
  } catch {
    res.status(500).json({ error: "Content generation failed. Please try again." });
  }
});

// POST /api/content/pack
router.post("/pack", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!TIER_ALLOWS_CONTENT.has(org.tier ?? "")) {
    res.status(403).json({ error: "Content Studio requires a Starter plan or higher" });
    return;
  }

  const usageInfo = await checkAndResetUsage(org, res);
  if (!usageInfo) return;

  const { packId, inputs } = req.body as { packId: string; inputs: Record<string, string> };
  const pack = PACKS[packId];
  if (!pack) { res.status(400).json({ error: `Unknown pack: ${packId}` }); return; }

  const tasksNeeded = pack.tasks.length;
  if (usageInfo.used + tasksNeeded > usageInfo.limit) {
    res.status(429).json({ error: `This pack uses ${tasksNeeded} AI tasks but you only have ${usageInfo.limit - usageInfo.used} remaining this month.` });
    return;
  }

  try {
    const client = getOpenAIClient();
    const orgName = org.name ?? "your organization";

    const results = await Promise.all(
      pack.tasks.map(async (t) => {
        const { system, user } = t.buildPrompt(inputs, orgName);
        const completion = await client.chat.completions.create({
          model: "gpt-5-mini",
          max_completion_tokens: 1024,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        });
        const content = completion.choices[0]?.message?.content?.trim() ?? "";
        return { taskId: t.taskId, label: t.label, content };
      })
    );

    await Promise.all([
      db.update(organizationsTable)
        .set({ aiMessagesUsed: sql`${organizationsTable.aiMessagesUsed} + ${tasksNeeded}` })
        .where(eq(organizationsTable.id, org.id)),
      ...results.map(r =>
        saveOutput(org.id, r.taskId, r.label, "pack", inputs, r.content, packId)
      ),
    ]);

    const newUsed = usageInfo.used + tasksNeeded;
    res.json({ results, packId, used: newUsed, limit: usageInfo.limit, remaining: usageInfo.limit - newUsed });
  } catch {
    res.status(500).json({ error: "Pack generation failed. Please try again." });
  }
});

// POST /api/content/email-delivery
router.post("/email-delivery", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!TIER_ALLOWS_CONTENT.has(org.tier ?? "")) {
    res.status(403).json({ error: "Content Studio requires a Starter plan or higher" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const audience = text(body.audience) as ContentAudience;
  const subject = text(body.subject);
  const messageBody = text(body.body);
  const dryRun = body.dryRun === true;
  const confirm = body.confirm === true;

  if (!CONTENT_AUDIENCES.has(audience)) {
    res.status(400).json({ error: "Choose a valid audience before sending." });
    return;
  }
  if (!subject || !messageBody) {
    res.status(400).json({ error: "Subject and body are required before sending." });
    return;
  }
  if (!dryRun && !confirm) {
    res.status(400).json({ error: "Preview recipients or confirm the send before emails go out." });
    return;
  }

  const recipients = await resolveContentRecipients(org.id, audience);
  if (!recipients.length) {
    res.status(400).json({
      error: `No ${audienceLabel(audience)} with email addresses were found.`,
      status: dryRun ? "dry_run" : "not_sent",
      recipientCount: 0,
      audience,
    });
    return;
  }

  if (dryRun) {
    res.json({
      status: "dry_run",
      audience,
      recipientCount: recipients.length,
      recipientsPreview: `${recipients.length} ${audienceLabel(audience)}`,
    });
    return;
  }

  const results: Array<{ email: string; sent: boolean; simulated?: boolean; error?: string }> = [];
  for (const recipient of recipients) {
    const result: MailResult = await sendEmail({
      to: recipient.email,
      subject,
      html: bodyToHtml(messageBody),
      text: messageBody,
    });
    results.push({
      email: recipient.email,
      sent: result.sent,
      simulated: result.simulated,
      error: result.error,
    });
  }

  const sentCount = results.filter((result) => result.sent).length;
  const simulatedCount = results.filter((result) => result.simulated).length;
  const failedCount = results.filter((result) => !result.sent && !result.simulated).length;
  res.status(failedCount ? 502 : 200).json({
    status: failedCount ? "partial_failure" : simulatedCount ? "simulated" : "sent",
    audience,
    recipientCount: recipients.length,
    sentCount,
    simulatedCount,
    failedCount,
    results,
  });
});

// POST /api/content/social-drafts
router.post("/social-drafts", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  if (!tierAllowsSocial(org.tier)) {
    res.status(403).json({ error: "Social media features require the Autopilot plan or higher" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const content = text(body.content);
  const mediaUrl = text(body.mediaUrl) || null;
  const scheduledAtRaw = text(body.scheduledAt);
  if (!content) {
    res.status(400).json({ error: "Post content is required." });
    return;
  }

  let scheduledAt: Date | null = null;
  if (scheduledAtRaw) {
    const parsed = new Date(scheduledAtRaw);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() < Date.now() + 60_000) {
      res.status(400).json({ error: "Schedule time must be at least 1 minute in the future." });
      return;
    }
    scheduledAt = parsed;
  }

  const requestedPlatforms = normalizePlatforms(body.platforms);
  const sections = splitSocialSections(content);
  const postsToCreate: Array<{ platforms: string[]; content: string }> = [];
  const skipped: string[] = [];

  if (sections.length) {
    for (const section of sections) {
      if (section.platform === "instagram" && !mediaUrl) {
        skipped.push("Instagram section skipped because Instagram needs a hosted image URL.");
        continue;
      }
      if (section.platform === "twitter" && section.content.length > 280) {
        skipped.push("X/Twitter section skipped because it is over 280 characters.");
        continue;
      }
      postsToCreate.push({ platforms: [section.platform], content: section.content });
    }
  } else {
    const platforms = requestedPlatforms.length ? requestedPlatforms : ["facebook"];
    if (platforms.includes("instagram") && !mediaUrl) {
      res.status(400).json({ error: "Instagram posts require a hosted image URL." });
      return;
    }
    if (platforms.includes("twitter") && content.length > 280) {
      res.status(400).json({ error: `X/Twitter posts must be 280 characters or fewer (current: ${content.length}).` });
      return;
    }
    postsToCreate.push({ platforms, content });
  }

  if (!postsToCreate.length) {
    res.status(400).json({ error: skipped[0] ?? "No social drafts could be created.", skipped });
    return;
  }

  const created = await db
    .insert(socialPostsTable)
    .values(postsToCreate.map((post) => ({
      orgId: org.id,
      platforms: post.platforms,
      content: post.content,
      mediaUrl,
      scheduledAt,
      status: scheduledAt ? "scheduled" : "draft",
    })))
    .returning();

  res.status(201).json({
    status: scheduledAt ? "scheduled" : "draft",
    created,
    skipped,
  });
});

// GET /api/content/history
router.get("/history", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const outputs = await db
    .select()
    .from(studioOutputsTable)
    .where(eq(studioOutputsTable.orgId, org.id))
    .orderBy(desc(studioOutputsTable.createdAt))
    .limit(100);

  res.json({ outputs });
});

// DELETE /api/content/history/:id
router.delete("/history/:id", async (req: Request, res: Response) => {
  const org = await resolveFullOrg(req, res);
  if (!org) return;

  const { id } = req.params;
  await db
    .delete(studioOutputsTable)
    .where(and(eq(studioOutputsTable.id, id), eq(studioOutputsTable.orgId, org.id)));

  res.json({ ok: true });
});

export default router;
