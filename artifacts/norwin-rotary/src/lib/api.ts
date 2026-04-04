const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = "/api/nrc";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
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

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ ok: boolean; username: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request<{ authenticated: boolean; username?: string }>("/auth/me"),

  // Events (public)
  getEvents: () => request<NrcEvent[]>("/events"),
  getEvent: (id: string) => request<NrcEvent>(`/events/${id}`),

  // Events (admin)
  adminGetEvents: () => request<NrcEvent[]>("/admin/events"),
  adminCreateEvent: (data: Partial<NrcEvent>) =>
    request<NrcEvent>("/admin/events", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateEvent: (id: string, data: Partial<NrcEvent>) =>
    request<NrcEvent>(`/admin/events/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteEvent: (id: string) =>
    request<{ ok: boolean }>(`/admin/events/${id}`, { method: "DELETE" }),

  // Blog (public)
  getBlogPosts: () => request<BlogPost[]>("/blog"),
  getBlogPost: (slug: string) => request<BlogPost>(`/blog/${slug}`),

  // Blog (admin)
  adminGetBlogPosts: () => request<BlogPost[]>("/admin/blog"),
  adminCreateBlogPost: (data: Partial<BlogPost>) =>
    request<BlogPost>("/admin/blog", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateBlogPost: (id: string, data: Partial<BlogPost>) =>
    request<BlogPost>(`/admin/blog/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteBlogPost: (id: string) =>
    request<{ ok: boolean }>(`/admin/blog/${id}`, { method: "DELETE" }),

  // Sponsors
  getSponsors: () => request<Sponsor[]>("/sponsors"),
  adminGetSponsors: () => request<Sponsor[]>("/admin/sponsors"),
  adminCreateSponsor: (data: Partial<Sponsor>) =>
    request<Sponsor>("/admin/sponsors", { method: "POST", body: JSON.stringify(data) }),
  adminUpdateSponsor: (id: string, data: Partial<Sponsor>) =>
    request<Sponsor>(`/admin/sponsors/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  adminDeleteSponsor: (id: string) =>
    request<{ ok: boolean }>(`/admin/sponsors/${id}`, { method: "DELETE" }),

  // Newsletter
  subscribe: (email: string, name?: string) =>
    request<{ ok: boolean; message: string }>("/newsletter/subscribe", {
      method: "POST",
      body: JSON.stringify({ email, name }),
    }),
  adminGetSubscribers: () => request<NewsletterSubscriber[]>("/admin/newsletter"),

  // Contact
  sendContact: (data: { name: string; email: string; message: string; subject?: string }) =>
    request<{ ok: boolean; message: string }>("/contact", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  adminGetMessages: () => request<ContactMessage[]>("/admin/contact"),
  adminMarkRead: (id: string) =>
    request<{ ok: boolean }>(`/admin/contact/${id}/read`, { method: "PUT" }),

  // Gallery
  getAlbums: () => request<GalleryAlbum[]>("/gallery"),
  getAlbum: (id: string) => request<{ album: GalleryAlbum; photos: AlbumPhoto[] }>(`/gallery/${id}`),
  adminCreateAlbum: (data: Partial<GalleryAlbum>) =>
    request<GalleryAlbum>("/admin/gallery/albums", { method: "POST", body: JSON.stringify(data) }),
  adminAddPhoto: (data: { album_id: string; url: string; caption?: string }) =>
    request<AlbumPhoto>("/admin/gallery/photos", { method: "POST", body: JSON.stringify(data) }),

  // Stats
  adminGetStats: () => request<AdminStats>("/admin/stats"),

  // Tickets
  checkout: (data: { event_id: string; quantity: number; buyer_email: string; buyer_name?: string }) =>
    request<{ url: string }>("/tickets/checkout", { method: "POST", body: JSON.stringify(data) }),
  verifyTicket: (session_id: string) =>
    request<{ status: string }>(`/tickets/verify?session_id=${session_id}`),
};

// Types
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
