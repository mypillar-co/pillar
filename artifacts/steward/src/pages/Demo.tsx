import React, { useState } from "react";
import {
  Bot, User, CheckCircle2, ChevronDown, ChevronUp,
  Rocket, ExternalLink, Globe,
} from "lucide-react";

const DEMO_CHAT: { q: string; a: string }[] = [
  { q: "What is the full name of your organization?", a: "Westside Rotary Club" },
  { q: 'What short name or abbreviation do you use?', a: "WRC" },
  { q: "What is your tagline or one-sentence mission statement?", a: "Service Above Self" },
  { q: "Do you have an existing website? If so, what's the URL?", a: "https://rotary.org  →  Pre-filled Facebook & Instagram from your site" },
  { q: "What city is your organization based in?", a: "Pittsburgh" },
  { q: "What state?", a: "Pennsylvania" },
  { q: "What is your organization's physical address?", a: "456 Forbes Ave, Pittsburgh, PA 15213" },
  { q: "Do you have a separate mailing address, or is it the same?", a: "Same as physical address (skipped)" },
  { q: "What is your main phone number?", a: "(412) 555-0100" },
  { q: "What is your main contact email?", a: "info@westsiderotary.org" },
  { q: "Do you have a separate email for event inquiries?", a: "Skipped" },
  { q: "What is your Facebook page URL?", a: "https://www.facebook.com/rotary" },
  { q: "What is your Instagram URL?", a: "Skipped" },
  { q: "What 2–3 letters should appear on your logo badge?", a: "WRC" },
  { q: "What type of organization are you?", a: "Rotary Club" },
  { q: "Approximately how many events do you host per year?", a: "24" },
  { q: "Approximately how many total attendees across all events?", a: "1,200" },
  { q: "How many active members does your organization have?", a: "85" },
  { q: "Do you accept event sponsors?", a: "Yes" },
  { q: "Do your events have vendor registration?", a: "No" },
  { q: "Do any of your events sell tickets?", a: "Yes" },
  { q: "Do you want a News & Updates / Blog section on your site?", a: "Yes" },
  { q: "Do you want email newsletter signup on your site?", a: "Yes" },
  { q: "List any community partners.", a: "No partners to list (skipped)" },
  { q: "What categories do your events fall into?", a: "Fundraisers, Community Service, Meetings, Social" },
  { q: "What is your regular meeting schedule?", a: "Every Tuesday at 12:00 PM, Pittsburgh Athletic Club" },
];

const DEMO_PAYLOAD = {
  orgName: "Westside Rotary Club",
  shortName: "WRC",
  tagline: "Service Above Self",
  location: "Pittsburgh, PA",
  contactPhone: "(412) 555-0100",
  contactEmail: "info@westsiderotary.org",
  primaryColor: "#1a3a5c",
  accentColor: "#c5a030",
  stats: [
    { label: "Annual Events",    value: "24" },
    { label: "Total Attendees",  value: "1,200" },
    { label: "Active Members",   value: "85" },
  ],
  features: ["News & Blog", "Newsletter", "Sponsors", "Ticketed Events"],
  partners: [] as string[],
  eventCategories: ["Fundraisers", "Community Service", "Meetings", "Social"],
  meetingSchedule: "Every Tuesday at 12:00 PM, Pittsburgh Athletic Club",
};

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#d4a017]/20 flex items-center justify-center">
        <Bot className="w-3.5 h-3.5 text-[#d4a017]" />
      </div>
      <div className="bg-[#0f1a2e] border border-[#1e3a5f] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed text-[#c8d8e8] max-w-[85%]">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 flex-row-reverse">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#1e3a5f] flex items-center justify-center">
        <User className="w-3.5 h-3.5 text-[#7a9cbf]" />
      </div>
      <div className="bg-[#1e3a5f] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed text-[#c8d8e8] max-w-[85%]">
        {children}
      </div>
    </div>
  );
}

export default function Demo() {
  const [showAll, setShowAll] = useState(false);
  const visibleChat = showAll ? DEMO_CHAT : DEMO_CHAT.slice(-6);
  const p = DEMO_PAYLOAD;

  return (
    <div className="min-h-screen bg-[#060e1c] flex flex-col items-center py-10 px-4">
      {/* Header */}
      <div className="w-full max-w-2xl mb-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#d4a017]/20 flex items-center justify-center">
          <Bot className="w-4 h-4 text-[#d4a017]" />
        </div>
        <div>
          <h1 className="text-white font-semibold text-sm">Community Builder — Live Demo</h1>
          <p className="text-[#7a9cbf] text-xs">26-question interview → site payload → launch</p>
        </div>
        <div className="ml-auto">
          <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Site Launched
          </div>
        </div>
      </div>

      {/* Progress bar — 100% complete */}
      <div className="w-full max-w-2xl mb-6">
        <div className="flex justify-between text-xs text-[#7a9cbf] mb-1">
          <span>Interview complete</span>
          <span>26 / 26</span>
        </div>
        <div className="h-1.5 bg-[#1e3a5f] rounded-full">
          <div className="h-1.5 bg-[#d4a017] rounded-full transition-all" style={{ width: "100%" }} />
        </div>
      </div>

      {/* Chat panel */}
      <div className="w-full max-w-2xl bg-[#0a1628] border border-[#1e3a5f] rounded-2xl overflow-hidden">
        <div className="px-6 py-5 space-y-4">

          {/* Toggle to show full history */}
          {!showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full text-center text-xs text-[#7a9cbf] hover:text-[#c8d8e8] py-1 transition-colors"
            >
              ↑ Show all 26 questions
            </button>
          )}

          {/* Chat history */}
          {visibleChat.map((item, i) => (
            <div key={i} className="space-y-2">
              <BotBubble>{item.q}</BotBubble>
              <UserBubble>{item.a}</UserBubble>
            </div>
          ))}

          {/* AI finalize message */}
          <BotBubble>
            Perfect — I've got everything I need. Building your community site configuration…
          </BotBubble>

          {/* Payload preview */}
          <div className="rounded-xl border border-[#d4a017]/30 bg-[#0f1a2e] overflow-hidden">
            <PayloadHeader orgName={p.orgName} />
            <div className="px-4 pb-4 space-y-3">
              {/* Identity grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pt-1">
                <div>
                  <span className="text-[#7a9cbf] block">Org Name</span>
                  <span className="text-white font-medium">{p.orgName}</span>
                </div>
                <div>
                  <span className="text-[#7a9cbf] block">Short Name</span>
                  <span className="text-white font-medium">{p.shortName}</span>
                </div>
                <div className="mt-1">
                  <span className="text-[#7a9cbf] block">Tagline</span>
                  <span className="text-[#c8d8e8]">{p.tagline}</span>
                </div>
                <div className="mt-1">
                  <span className="text-[#7a9cbf] block">Location</span>
                  <span className="text-[#c8d8e8]">{p.location}</span>
                </div>
                <div className="mt-1">
                  <span className="text-[#7a9cbf] block">Phone</span>
                  <span className="text-[#c8d8e8]">{p.contactPhone}</span>
                </div>
                <div className="mt-1">
                  <span className="text-[#7a9cbf] block">Email</span>
                  <span className="text-[#c8d8e8] break-all">{p.contactEmail}</span>
                </div>
              </div>

              {/* Brand colors */}
              <div>
                <span className="text-[#7a9cbf] text-xs block mb-1.5">Brand Colors</span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded border border-white/20" style={{ backgroundColor: p.primaryColor }} />
                    <span className="text-xs text-[#c8d8e8] font-mono">{p.primaryColor}</span>
                    <span className="text-xs text-[#7a9cbf]">Primary</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded border border-white/20" style={{ backgroundColor: p.accentColor }} />
                    <span className="text-xs text-[#c8d8e8] font-mono">{p.accentColor}</span>
                    <span className="text-xs text-[#7a9cbf]">Accent</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div>
                <span className="text-[#7a9cbf] text-xs block mb-1.5">Stats</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {p.stats.map((s, i) => (
                    <div key={i} className="text-center bg-[#1e3a5f]/50 rounded-lg p-2">
                      <div className="text-[#d4a017] font-bold text-sm leading-tight">{s.value}</div>
                      <div className="text-[#7a9cbf] text-[10px] leading-tight mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Event categories */}
              <div>
                <span className="text-[#7a9cbf] text-xs block mb-1">Event Categories</span>
                <div className="flex flex-wrap gap-1">
                  {p.eventCategories.map((c, i) => (
                    <span key={i} className="text-xs bg-[#1e3a5f] text-[#c8d8e8] px-2 py-0.5 rounded-full">{c}</span>
                  ))}
                </div>
              </div>

              {/* Meeting schedule */}
              <div>
                <span className="text-[#7a9cbf] text-xs block mb-0.5">Meeting Schedule</span>
                <span className="text-xs text-[#c8d8e8]">{p.meetingSchedule}</span>
              </div>

              {/* Features enabled */}
              <div>
                <span className="text-[#7a9cbf] text-xs block mb-1">Features Enabled</span>
                <div className="flex flex-wrap gap-1">
                  {p.features.map((f, i) => (
                    <span key={i} className="text-xs bg-green-500/10 border border-green-500/30 text-green-300 px-2 py-0.5 rounded-full">{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Success banner */}
          <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-green-300 font-medium">Community site launched successfully!</p>
              <p className="text-xs text-green-400/70 mt-0.5">
                Your configuration was sent to{" "}
                <span className="font-mono">westsiderotary.org</span> — the site is now live.
              </p>
              <a
                href="https://westsiderotary.org"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-200 underline underline-offset-2"
              >
                <Globe className="w-3 h-3" />
                Visit westsiderotary.org
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex-shrink-0 border-t border-[#1e3a5f] px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => setShowAll(false)}
            className="text-xs text-[#7a9cbf] hover:text-white transition-colors"
          >
            Start over
          </button>
          <div className="flex-1" />
          <button className="flex items-center gap-2 bg-[#d4a017] hover:bg-[#c5920f] text-[#060e1c] font-semibold text-sm px-5 py-2 rounded-xl transition-colors">
            <Rocket className="w-4 h-4" />
            Launched ✓
          </button>
        </div>
      </div>

      <p className="text-[#7a9cbf] text-xs mt-6 text-center max-w-md">
        This is a live demo of the 26-question interview flow. The actual interview is behind login at{" "}
        <span className="font-mono text-[#c8d8e8]">/dashboard/site</span>.
      </p>
    </div>
  );
}

function PayloadHeader({ orgName }: { orgName: string }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#d4a017] hover:bg-white/5 transition-colors"
    >
      <span className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4" />
        Ready to launch — {orgName}
      </span>
      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
    </button>
  );
}
