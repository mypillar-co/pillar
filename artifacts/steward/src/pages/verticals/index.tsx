import React from "react";
import { Globe, Calendar, Share2, Bot, Shield, Users, DollarSign, Zap, MessageSquare, Clock } from "lucide-react";
import { VerticalLanding, type VerticalConfig } from "../VerticalLanding";

const icon = (I: React.ElementType) => <I className="w-5 h-5 text-primary" />;

const VERTICALS: Record<string, VerticalConfig> = {
  lodges: {
    slug: "lodges",
    orgType: "lodge",
    orgTypePlural: "Masonic lodges & fraternal orders",
    heroHeadline: "Your lodge, on autopilot.",
    heroSub: "Build a professional website, manage dues events, and keep your brothers informed — without asking a tech-savvy member to do it for free.",
    accentQuote: "We haven't updated our website since 2009. Nobody knows how.",
    painPoints: [
      "Your website looks like it was built in 2005 (because it was)",
      "Meeting announcements go out via forwarded email chains",
      "Tracking who paid dues is done in a spreadsheet",
      "Every committee chair asks the same \"can you update the website?\" question",
      "New members can't find basic information about your lodge online",
      "Your social media page has 47 posts — the last one from 3 years ago",
    ],
    benefits: [
      { icon: icon(Globe), title: "Professional website in 10 minutes", body: "AI builds your lodge site from a short interview — history, officers, meeting times, and contact info. No web designer needed." },
      { icon: icon(Calendar), title: "Event and meeting management", body: "Publish your lodge calendar, collect RSVPs for degree work, and send reminders automatically to your members." },
      { icon: icon(Share2), title: "Automatic social media presence", body: "Steward posts meeting reminders, event announcements, and lodge news to Facebook and Instagram on autopilot." },
      { icon: icon(Bot), title: "AI updates — no committee required", body: "When things change, just chat with Steward. It updates your site instantly. No FTP, no passwords, no IT guy." },
    ],
    ctaLabel: "Build my lodge site",
  },

  rotary: {
    slug: "rotary",
    orgType: "Rotary club",
    orgTypePlural: "Rotary clubs & service organizations",
    heroHeadline: "Service above self — not above IT.",
    heroSub: "Focus on your community projects, not your website. Steward keeps your club's digital presence professional, current, and fully automatic.",
    accentQuote: "Our club president keeps a sticky note on his monitor that says 'UPDATE THE WEBSITE'. It's been there for two years.",
    painPoints: [
      "Your website was set up by a member who moved away five years ago",
      "New potential members can't find your meeting time or location online",
      "Your club's service projects deserve more visibility than a Facebook photo from 2021",
      "Fellowship events are promoted via email blast — no ticketing, no RSVPs",
      "Sharing news with Rotary International requires extra manual effort every time",
      "Each new president restarts from scratch with no digital handoff process",
    ],
    benefits: [
      { icon: icon(Globe), title: "Club website built for Rotary", body: "Your meeting schedule, projects, officers, and membership info — organized and searchable, ready for prospective members." },
      { icon: icon(Calendar), title: "Fellowship events made easy", body: "Sell tickets for fundraisers, collect RSVPs for socials, and send automated reminders. No Eventbrite account needed." },
      { icon: icon(Share2), title: "Social media on autopilot", body: "Steward drafts and posts your service updates, event promotions, and club news to your social accounts automatically." },
      { icon: icon(MessageSquare), title: "Easy member communications", body: "Keep your membership informed with automatically generated event summaries, project updates, and announcements." },
    ],
    ctaLabel: "Build my club site",
  },

  vfw: {
    slug: "vfw",
    orgType: "veterans post",
    orgTypePlural: "veterans posts & veteran service organizations",
    heroHeadline: "Your post's mission, online.",
    heroSub: "Honor your members' service with a professional online presence. Steward builds and maintains your post's website so you can focus on serving veterans.",
    accentQuote: "Our post has been serving veterans since 1948. Our website looks like it's from 1998.",
    painPoints: [
      "Veterans searching for resources can't find your post online",
      "Your hall rental and event information isn't visible to the public",
      "Your social media presence is nonexistent or severely outdated",
      "New member recruitment is entirely word-of-mouth",
      "Tracking fundraiser ticket sales is done with paper and cash",
      "Each new Commander starts from scratch — no digital continuity between officers",
    ],
    benefits: [
      { icon: icon(Shield), title: "Dignified, professional post website", body: "Your history, mission, officers, and resources — presented in a way that honors your members' service. Live in under an hour." },
      { icon: icon(Calendar), title: "Events, fundraisers, and hall rental", body: "Sell tickets for your annual gala, manage hall rental requests, and coordinate volunteer events — all in one place." },
      { icon: icon(Share2), title: "Recruiting on social media", body: "Steward posts veteran-focused content, event announcements, and post news to Facebook automatically. New members find you." },
      { icon: icon(Users), title: "Continuity across leadership", body: "When the Commander changes, nothing breaks. Steward preserves your digital presence through every leadership transition." },
    ],
    ctaLabel: "Build my post site",
  },

  hoa: {
    slug: "hoa",
    orgType: "HOA",
    orgTypePlural: "homeowner associations",
    heroHeadline: "Run your HOA like a professional property manager.",
    heroSub: "Give your community a central hub for announcements, events, and governance — without hiring a management company.",
    accentQuote: "We send the same parking policy email three times a year because nobody remembers where to find it.",
    painPoints: [
      "Residents don't know where to find the latest rules, documents, or board meeting minutes",
      "Community announcements go out via reply-all email chains that nobody reads",
      "HOA events like the block party or pool opening require massive coordination effort",
      "Board elections and community votes happen via printed ballots and honor system",
      "New residents get a folder of paper documents that are already out of date",
      "Managing vendor relationships (landscaping, pool service, etc.) is entirely in your head",
    ],
    benefits: [
      { icon: icon(Globe), title: "Community hub website", body: "One place for rules, documents, board meeting minutes, contact info, and announcements. Always current, automatically maintained." },
      { icon: icon(Calendar), title: "Community events made simple", body: "Pool parties, community meetings, neighborhood cleanups — RSVP tracking, reminders, and announcements handled automatically." },
      { icon: icon(Share2), title: "Resident communications", body: "Push important updates to your neighborhood's social pages. Automated posting means no one misses a critical notice." },
      { icon: icon(Bot), title: "AI-powered document updates", body: "Changed a policy? Just tell Steward. Your website, announcement, and relevant documents update simultaneously." },
    ],
    ctaLabel: "Build my HOA site",
  },

  pta: {
    slug: "pta",
    orgType: "PTA",
    orgTypePlural: "PTAs & school parent organizations",
    heroHeadline: "Every parent informed, every event fully supported.",
    heroSub: "Stop chasing RSVPs and resending reminder emails. Steward keeps your school community connected automatically.",
    accentQuote: "I sent the Scholastic Book Fair reminder to 400 email addresses and got 40 out-of-office replies and 12 unsubscribes.",
    painPoints: [
      "Event RSVP tracking is done via Google Form + manual spreadsheet counting",
      "Volunteer sign-ups are still happening via paper sign-up sheets in the front office",
      "Your website was set up by a parent three years ago who has since graduated their child",
      "Social media updates fall entirely on the President's personal time and phone",
      "Fundraiser ticket sales involve physical money, Venmo requests, and a receipt book",
      "New board members get overwhelmed by the lack of documented processes",
    ],
    benefits: [
      { icon: icon(Users), title: "Parent engagement made easy", body: "A public-facing website with your event calendar, volunteer opportunities, and news. Parents always know what's happening." },
      { icon: icon(Calendar), title: "Event and fundraiser management", body: "Sell tickets for the spring gala, manage the book fair, coordinate the fun run. Online payments, RSVPs, and reminders included." },
      { icon: icon(Share2), title: "Automated school social media", body: "Steward drafts and posts your event reminders, fundraiser updates, and school news to your social pages on a schedule you control." },
      { icon: icon(Zap), title: "Continuity every school year", body: "When the board changes in June, Steward keeps running. New leadership inherits a fully operational digital presence on day one." },
    ],
    ctaLabel: "Build my PTA site",
  },

  nonprofits: {
    slug: "nonprofits",
    orgType: "nonprofit",
    orgTypePlural: "nonprofits & community organizations",
    heroHeadline: "Punch above your weight class.",
    heroSub: "Professional website, automated social media, online events, and donor-facing communications — for the price of one freelancer hour per month.",
    accentQuote: "We're a $500K nonprofit operating with a website that looks like a $50 website.",
    painPoints: [
      "Your website doesn't reflect the impact you're actually making in the community",
      "Grantmakers Google you before deciding — and what they find isn't impressive",
      "Volunteer recruitment happens entirely through word-of-mouth and Nextdoor posts",
      "Your social media presence is inconsistent because it depends on whoever has time",
      "Events require massive manual coordination — emails, reminders, ticketing, RSVPs",
      "Donor communications are ad-hoc and inconsistent across board leadership transitions",
    ],
    benefits: [
      { icon: icon(Globe), title: "Impact-forward organization website", body: "A professional site that tells your story, highlights your programs, and makes grantmakers and donors confident in your org." },
      { icon: icon(DollarSign), title: "Events and fundraiser ticketing", body: "Sell tickets for galas, manage fundraising events, and accept online payments — with a 2.5% platform fee, no monthly platform cost." },
      { icon: icon(Share2), title: "Consistent social media presence", body: "Your impact stories, volunteer calls, and event promotions go out on Facebook, Instagram, and X automatically. Every week, without fail." },
      { icon: icon(Bot), title: "AI content that sounds like you", body: "Steward learns your voice, tone, and mission. Every post, page update, and announcement sounds authentic — not AI-generated." },
    ],
    ctaLabel: "Build my nonprofit site",
  },
};

export function LodgesPage() { return <VerticalLanding config={VERTICALS.lodges} />; }
export function RotaryPage() { return <VerticalLanding config={VERTICALS.rotary} />; }
export function VFWPage() { return <VerticalLanding config={VERTICALS.vfw} />; }
export function HOAPage() { return <VerticalLanding config={VERTICALS.hoa} />; }
export function PTAPage() { return <VerticalLanding config={VERTICALS.pta} />; }
export function NonprofitsPage() { return <VerticalLanding config={VERTICALS.nonprofits} />; }
