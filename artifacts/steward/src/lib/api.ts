async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export type EventItem = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  eventType?: string | null;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  isTicketed?: boolean;
  ticketPrice?: number | null;
  featured?: boolean;
  imageUrl?: string | null;
  isActive?: boolean;
  createdAt: string;
};

export type Vendor = {
  id: string;
  name: string;
  vendorType?: string | null;
  email?: string | null;
  phone?: string | null;
  status: string;
  notes?: string | null;
};

export type Sponsor = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  status: string;
  notes?: string | null;
};

export type ContactItem = {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  contactType?: string | null;
};

export type Stats = {
  activeEvents: number;
  totalVendors: number;
  totalSponsors: number;
  totalContacts: number;
  totalRevenue: number;
};

export const api = {
  stats: {
    get: () => req<Stats>("/api/stats"),
  },
  events: {
    list: () => req<EventItem[]>("/api/events"),
    get: (id: string) => req<EventItem>(`/api/events/${id}`),
    create: (data: Partial<EventItem>) => req<EventItem>("/api/events", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<EventItem>) => req<EventItem>(`/api/events/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/api/events/${id}`, { method: "DELETE" }),
  },
  vendors: {
    list: () => req<Vendor[]>("/api/vendors"),
    create: (data: Partial<Vendor>) => req<Vendor>("/api/vendors", { method: "POST", body: JSON.stringify(data) }),
  },
  sponsors: {
    list: () => req<Sponsor[]>("/api/sponsors"),
    create: (data: Partial<Sponsor>) => req<Sponsor>("/api/sponsors", { method: "POST", body: JSON.stringify(data) }),
  },
  contacts: {
    list: () => req<ContactItem[]>("/api/contacts"),
    create: (data: Partial<ContactItem>) => req<ContactItem>("/api/contacts", { method: "POST", body: JSON.stringify(data) }),
  },
};
