import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { HeroVisualType } from "./lib/heroVisual";

export interface OrgConfig {
  orgId: string;
  orgName: string;
  shortName?: string | null;
  orgType?: string | null;
  tagline?: string | null;
  mission?: string | null;
  location?: string | null;
  primaryColor: string;
  accentColor: string;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  heroVisualType?: HeroVisualType | null;
  heroLayout?: "split_framed" | "full_bleed" | "split" | "background" | null;
  siteArchetype?: string | null;
  stylePreset?: string | null;
  memberCount?: number;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
  mailingAddress?: string | null;
  website?: string | null;
  socialFacebook?: string | null;
  socialInstagram?: string | null;
  socialTwitter?: string | null;
  socialLinkedin?: string | null;
  meetingDay?: string | null;
  meetingTime?: string | null;
  meetingLocation?: string | null;
  footerText?: string | null;
  metaDescription?: string | null;
  stats?: { value: string; label: string }[];
  programs?: { icon: string; title: string; description: string }[];
  partners?: { name: string; description: string; website?: string }[];
  sponsorshipLevels?: { name: string; price: string; benefits: string[] }[];
  sections?: HomepageSectionBlock[];
  features?: {
    blog?: boolean;
    newsletter?: boolean;
    vendors?: boolean;
    sponsors?: boolean;
    businessDirectory?: boolean;
    ticketedEvents?: boolean;
    members?: boolean;
    membersPortal?: unknown;
    heroVisualType?: HeroVisualType | null;
    heroLayout?: "split_framed" | "full_bleed" | "split" | "background" | null;
    siteArchetype?: string | null;
    stylePreset?: string | null;
    customPages?: CustomPageConfig[];
    homepageSections?: HomepageSectionBlock[];
    pageSections?: Record<string, HomepageSectionBlock[]>;
  };
  _empty?: boolean;
}

export interface HomepageSectionBlock {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  body?: string;
  visible?: boolean;
  imageUrl?: string | null;
  data?: Record<string, unknown>;
}

export interface CustomPageConfig {
  title: string;
  slug: string;
  navLabel?: string;
  showInNav?: boolean;
  intro?: string;
  sections?: { title: string; body: string }[];
  media?: { type: "image"; url?: string; alt?: string; caption?: string };
  form?: CustomPageFormConfig;
  blocks?: HomepageSectionBlock[];
  cta?: { label: string; href: string };
}

export interface CustomPageFormConfig {
  type: "request_info";
  title: string;
  description?: string;
  submitLabel?: string;
  fields: Array<{
    name: string;
    label: string;
    type: "text" | "email" | "select" | "textarea";
    required?: boolean;
    options?: string[];
  }>;
}

const ConfigContext = createContext<OrgConfig | null>(null);

interface PreviewConfigPatch {
  homepageSections?: HomepageSectionBlock[];
  pageSections?: Record<string, HomepageSectionBlock[]>;
}

function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("pillar_preview") === "1";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function previewParentOrigin(): string | null {
  if (typeof document === "undefined") return null;
  return document.referrer ? safeOrigin(document.referrer) : null;
}

function isTrustedPreviewMessage(event: MessageEvent): boolean {
  if (typeof window === "undefined") return false;
  if (event.source !== window.parent) return false;
  const parentOrigin = previewParentOrigin();
  if (parentOrigin && event.origin === parentOrigin) return true;
  if (event.origin === window.location.origin) return true;
  const origin = safeOrigin(event.origin);
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return isLocalHostname(window.location.hostname) && isLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function postPreviewMessage(message: Record<string, unknown>) {
  const targetOrigin = previewParentOrigin() ?? window.location.origin;
  window.parent?.postMessage(message, targetOrigin);
}

function isHomepageSectionList(value: unknown): value is HomepageSectionBlock[] {
  return Array.isArray(value) && value.every(section => (
    isRecord(section) &&
    typeof section.id === "string" &&
    typeof section.type === "string"
  ));
}

function isPageSectionMap(value: unknown): value is Record<string, HomepageSectionBlock[]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isHomepageSectionList);
}

type EditableFieldName = "title" | "subtitle" | "body";

function isEditableField(value: string | null): value is EditableFieldName {
  return value === "title" || value === "subtitle" || value === "body";
}

function sanitizeInlineText(value: string, field: EditableFieldName): string {
  const maxLength = field === "title" ? 160 : field === "subtitle" ? 240 : 2200;
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxLength);
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery<OrgConfig>({ queryKey: ["/api/org-config"] });
  const [previewPatch, setPreviewPatch] = useState<PreviewConfigPatch | null>(null);

  useEffect(() => {
    if (!isPreviewMode()) return;

    function handleMessage(event: MessageEvent) {
      if (!isTrustedPreviewMessage(event)) return;
      const message = event.data;
      if (!isRecord(message)) return;

      if (message.type === "pillar:preview-config") {
        const patch = isRecord(message.patch) ? message.patch : {};
        setPreviewPatch({
          homepageSections: isHomepageSectionList(patch.homepageSections)
            ? patch.homepageSections
            : undefined,
          pageSections: isPageSectionMap(patch.pageSections)
            ? patch.pageSections
            : undefined,
        });
      }

      if (message.type === "pillar:preview-reset") {
        setPreviewPatch(null);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!isPreviewMode()) return;
    document.documentElement.dataset.pillarPreviewEditing = "true";

    let active: HTMLElement | null = null;
    let originalText = "";

    function finishEdit(commit: boolean) {
      if (!active) return;
      const element = active;
      const field = isEditableField(element.dataset.pillarField ?? null)
        ? element.dataset.pillarField
        : null;
      const pageKey = element.dataset.pillarPage;
      const sectionId = element.dataset.pillarSection;
      if (!field || !pageKey || !sectionId) return;

      if (commit) {
        const value = sanitizeInlineText(element.textContent ?? "", field);
        element.textContent = value || originalText;
        postPreviewMessage({
          type: "pillar:inline-edit",
          pageKey,
          sectionId,
          field,
          value: value || originalText,
        });
      } else {
        element.textContent = originalText;
      }

      element.contentEditable = "false";
      element.removeAttribute("data-pillar-editing");
      active = null;
      originalText = "";
    }

    function beginEdit(element: HTMLElement) {
      if (active && active !== element) finishEdit(true);
      active = element;
      originalText = element.textContent ?? "";
      element.contentEditable = "true";
      element.dataset.pillarEditing = "true";
      element.focus();

      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      postPreviewMessage({
        type: "pillar:inline-select",
        pageKey: element.dataset.pillarPage,
        sectionId: element.dataset.pillarSection,
        field: element.dataset.pillarField,
      });
    }

    function handleClick(event: MouseEvent) {
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-pillar-edit='text']")
        : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      beginEdit(target);
    }

    function handleFocusOut(event: FocusEvent) {
      if (active && event.target === active) finishEdit(true);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!active || event.target !== active) return;
      if (event.key === "Escape") {
        event.preventDefault();
        finishEdit(false);
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        finishEdit(true);
      }
    }

    function handlePaste(event: ClipboardEvent) {
      if (!active || event.target !== active) return;
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        active.textContent = `${active.textContent ?? ""}${text}`;
        return;
      }
      selection.deleteFromDocument();
      selection.getRangeAt(0).insertNode(document.createTextNode(text));
      selection.collapseToEnd();
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("paste", handlePaste, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("paste", handlePaste, true);
      delete document.documentElement.dataset.pillarPreviewEditing;
    };
  }, []);

  const config = useMemo<OrgConfig | undefined>(() => {
    if (!data || (!previewPatch?.homepageSections && !previewPatch?.pageSections)) return data;

    return {
      ...data,
      sections: previewPatch.homepageSections ?? data.sections,
      features: {
        ...data.features,
        homepageSections: previewPatch.homepageSections ?? data.features?.homepageSections,
        pageSections: {
          ...(data.features?.pageSections ?? {}),
          ...(previewPatch.pageSections ?? {}),
        },
      },
    };
  }, [data, previewPatch]);

  useEffect(() => {
    if (config && !config._empty) {
      document.documentElement.style.setProperty("--primary-hex", config.primaryColor || "#c25038");
      document.documentElement.style.setProperty("--accent-hex", config.accentColor || "#2563eb");
      if (config.metaDescription) {
        const meta = document.querySelector('meta[name="description"]') || document.createElement("meta");
        meta.setAttribute("name", "description");
        meta.setAttribute("content", config.metaDescription);
        document.head.appendChild(meta);
      }
      document.title = config.orgName || "Community Platform";
    }
  }, [config]);

  return <ConfigContext.Provider value={config || null}>{children}</ConfigContext.Provider>;
}

export function useConfig(): OrgConfig | null {
  return useContext(ConfigContext);
}
