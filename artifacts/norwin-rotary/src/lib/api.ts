import { getOrgSlug } from "@/lib/orgSlug";

const orgSlug = getOrgSlug();
const PUBLIC_API = `/api/org/${orgSlug}`;
const ADMIN_API = "/api/nrc";

async function request<T>(api: string, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${api}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function pub<T>(path: string, options?: RequestInit) {
  return request<T>(PUBLIC_API, path, options);
}

function adm<T>(path: string, options?: RequestInit) {
  return request<T>(ADMIN_API, path, options);
}

export const api = {
  // ── Auth (NRC admin) ──────────────────────────────────────────────────────
  login: (username: string, password: string) =>
    adm<{ ok: boolean; username: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => adm("/auth/logout", { method: "POST" }),
  me: () => adm<{ authenticated: boolean; username?: string }>("/auth/me"),

  // ── Events (public) ───────────────────────────────────────────────────────
  getEvents: () => pub<OrgEvent[]>("/events"),
  getEvent: (id: string) => pub<OrgEvent>(`/events/${id}`),

  // ── Events (admin — NRC only) ─────────────────────────────────────────────
  adminGetEvents: () => adm<NrcEvent[]>("/admin/events"),
  adminCreateEvent: (data: Partial<NrcEvent>) =>
    adm<NrcEvent>("/admin/events", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateEvent: (id: string, data: Partial<NrcEvent>) =>
    adm<NrcEvent>(`/admin/events/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteEvent: (id: string) =>
    adm<{ ok: boolean }>(`/admin/events/${id}`, { method: "DELETE" }),

  // ── Blog (public) ─────────────────────────────────────────────────────────
  getBlogPosts: () => pub<BlogPost[]>("/blog"),
  getBlogPost: (slug: string) => pub<BlogPost>(`/blog/${slug}`),

  // ── Blog (admin — NRC only) ───────────────────────────────────────────────
  adminGetBlogPosts: () => adm<NrcEvent[]>("/admin/blog"),
  adminCreateBlogPost: (data: Partial<BlogPost>) =>
    adm<BlogPost>("/admin/blog", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateBlogPost: (id: string, data: Partial<BlogPost>) =>
    adm<BlogPost>(`/admin/blog/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteBlogPost: (id: string) =>
    adm<{ ok: boolean }>(`/admin/blog/${id}`, { method: "DELETE" }),

  // ── Sponsors (public) ─────────────────────────────────────────────────────
  getSponsors: () => pub<Sponsor[]>("/sponsors"),

  // ── Sponsors (admin — NRC only) ───────────────────────────────────────────
  adminGetSponsors: () => adm<NrcEvent[]>("/admin/sponsors"),
  adminCreateSponsor: (data: Partial<Sponsor>) =>
    adm<Sponsor>("/admin/sponsors", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateSponsor: (id: string, data: Partial<Sponsor>) =>
    adm<Sponsor>(`/admin/sponsors/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteSponsor: (id: string) =>
    adm<{ ok: boolean }>(`/admin/sponsors/${id}`, { method: "DELETE" }),

  // ── Newsletter (public) ───────────────────────────────────────────────────
  subscribe: (email: string, name?: string) =>
    pub<{ ok: boolean; message: string }>("/newsletter/subscribe", {
      method: "POST",
      body: JSON.stringify({ email, name }),
    }),

  // ── Newsletter (admin) ────────────────────────────────────────────────────
  adminGetSubscribers: () => adm<NewsletterSubscriber[]>("/admin/newsletter"),

  // ── Contact (public) ──────────────────────────────────────────────────────
  sendContact: (data: { name: string; email: string; message: string; subject?: string }) =>
    pub<{ ok: boolean; message: string }>("/contact", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ── Contact (admin) ───────────────────────────────────────────────────────
  adminGetMessages: () => adm<ContactMessage[]>("/admin/contact"),
  adminMarkRead: (id: string) =>
    adm<{ ok: boolean }>(`/admin/contact/${id}/read`, { method: "PUT" }),

  // ── Gallery (public) ──────────────────────────────────────────────────────
  getAlbums: () => pub<GalleryAlbum[]>("/gallery"),
  getAlbum: (id: string) => pub<{ album: GalleryAlbum; photos: AlbumPhoto[] }>(`/gallery/${id}`),

  // ── Gallery (admin) ───────────────────────────────────────────────────────
  adminCreateAlbum: (data: Partial<GalleryAlbum>) =>
    adm<GalleryAlbum>("/admin/gallery/albums", { method: "POST", body: JSON.stringify(data) }),
  adminAddPhoto: (data: { album_id: string; url: string; caption?: string }) =>
    adm<AlbumPhoto>("/admin/gallery/photos", { method: "POST", body: JSON.stringify(data) }),

  // ── Stats (admin) ─────────────────────────────────────────────────────────
  adminGetStats: () => adm<AdminStats>("/admin/stats"),

  // ── Tickets (public) ──────────────────────────────────────────────────────
  checkout: (data: { event_id: string; quantity: number; buyer_email: string; buyer_name?: string }) =>
    pub<{ url: string }>("/checkout", { method: "POST", body: JSON.stringify(data) }),
  verifyTicket: (session_id: string) =>
    pub<{ status: string }>(`/tickets/verify?session_id=${session_id}`),
};

// ── Types ──────────────────────────────────────────────────────────────────────

/** Public org event — returned by /api/public/:orgSlug/events */
export interface OrgEvent {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  event_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  image_url?: string;
  is_ticketed: boolean;
  ticket_price?: number;
  ticket_capacity?: number;
  tickets_sold?: number;
  is_published: boolean;
  ticket_sale_open?: string;
  ticket_sale_close?: string;
  created_at: string;
}

/** Legacy NRC event type — used only by the NRC admin panel */
export interface NrcEvent {
  id: string;
  title: string;
  description?: string;
  event_date: string;
  end_date?: string;
  location?: string;
  image_url?: string;
  is_ticketed: boolean;
  ticket_price?: number;
  ticket_capacity?: number;
  tickets_sold?: number;
  is_published: boolean;
  stripe_price_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  body?: string;
  cover_image_url?: string;
  author: string;
  tags?: string;
  is_published: boolean;
  published_at?: string;
  created_at: string;
}

export interface Sponsor {
  id: string;
  name: string;
  logo_url?: string;
  website_url?: string;
  tier: string;
  description?: string;
  tier_rank: number;
  is_active: boolean;
}

export interface NewsletterSubscriber {
  id: string;
  org_id: string;
  email: string;
  name?: string;
  subscribed_at: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject?: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface GalleryAlbum {
  id: string;
  title: string;
  description?: string;
  event_slug?: string;
  cover_photo_id?: string;
  cover_photo_url?: string;
  photo_count?: number;
  created_at: string;
}

export interface AlbumPhoto {
  id: string;
  album_id: string;
  url: string;
  caption?: string;
  created_at: string;
}

export interface AdminStats {
  publishedEvents: number;
  publishedPosts: number;
  subscribers: number;
  unreadMessages: number;
  activeSponsors: number;
}
