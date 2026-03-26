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
  maxCapacity?: number | null;
  isTicketed?: boolean;
  ticketPrice?: number | null;
  ticketCapacity?: number | null;
  requiresApproval?: boolean;
  isRecurring?: boolean;
  recurringTemplateId?: string | null;
  featured?: boolean;
  imageUrl?: string | null;
  isActive?: boolean;
  createdAt: string;
  updatedAt?: string;
  totalSold?: number;
  totalRevenue?: number;
};

export type TicketType = {
  id: string;
  eventId: string;
  orgId: string;
  name: string;
  description?: string | null;
  price: number;
  quantity?: number | null;
  sold: number;
  isActive: boolean;
  createdAt: string;
};

export type TicketSale = {
  id: string;
  eventId: string;
  ticketTypeId?: string | null;
  orgId: string;
  attendeeName: string;
  attendeeEmail?: string | null;
  attendeePhone?: string | null;
  quantity: number;
  amountPaid: number;
  paymentMethod?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type EventApproval = {
  id: string;
  eventId: string;
  orgId: string;
  approverUserId?: string | null;
  submittedByUserId?: string | null;
  status: string;
  comments?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type EventCommunication = {
  id: string;
  eventId: string;
  orgId: string;
  subject: string;
  body: string;
  recipientCount: number;
  sentAt: string;
};

export type EventDetail = {
  event: EventItem;
  ticketTypes: TicketType[];
  sales: TicketSale[];
  approvals: EventApproval[];
  communications: EventCommunication[];
  totalRevenue: number;
  totalSold: number;
};

export type EventMetrics = {
  totalEvents: number;
  publishedEvents: number;
  upcomingEvents: Array<{ id: string; name: string; startDate: string | null; status: string }>;
  totalTicketsSold: number;
  thisMonthTicketsSold: number;
  totalRevenue: number;
};

export type RecurringTemplate = {
  id: string;
  orgId: string;
  name: string;
  description?: string | null;
  eventType?: string | null;
  location?: string | null;
  startTime?: string | null;
  durationMinutes?: number | null;
  frequency: string;
  dayOfWeek?: number | null;
  weekOfMonth?: number | null;
  dayOfMonth?: number | null;
  isActive: boolean;
  lastGeneratedAt?: string | null;
  nextGenerateAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type ApprovalQueueItem = {
  approval: EventApproval;
  event: EventItem;
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
    get: (id: string) => req<EventDetail>(`/api/events/${id}`),
    create: (data: Partial<EventItem> & { requiresApproval?: boolean }) => req<EventItem>("/api/events", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<EventItem>) => req<EventItem>(`/api/events/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/api/events/${id}`, { method: "DELETE" }),
    submit: (id: string) => req<EventItem>(`/api/events/${id}/submit`, { method: "POST" }),
    approve: (id: string, comments?: string) => req<EventItem>(`/api/events/${id}/approve`, { method: "POST", body: JSON.stringify({ comments }) }),
    reject: (id: string, comments?: string) => req<EventItem>(`/api/events/${id}/reject`, { method: "POST", body: JSON.stringify({ comments }) }),
    metrics: () => req<EventMetrics>("/api/events/metrics"),
    approvalQueue: () => req<ApprovalQueueItem[]>("/api/events/approvals/queue"),
    ticketTypes: {
      list: (eventId: string) => req<TicketType[]>(`/api/events/${eventId}/ticket-types`),
      create: (eventId: string, data: Partial<TicketType>) => req<TicketType>(`/api/events/${eventId}/ticket-types`, { method: "POST", body: JSON.stringify(data) }),
      update: (eventId: string, typeId: string, data: Partial<TicketType>) => req<TicketType>(`/api/events/${eventId}/ticket-types/${typeId}`, { method: "PUT", body: JSON.stringify(data) }),
      delete: (eventId: string, typeId: string) => req<void>(`/api/events/${eventId}/ticket-types/${typeId}`, { method: "DELETE" }),
    },
    sales: {
      list: (eventId: string) => req<TicketSale[]>(`/api/events/${eventId}/sales`),
      create: (eventId: string, data: Partial<TicketSale>) => req<TicketSale>(`/api/events/${eventId}/sales`, { method: "POST", body: JSON.stringify(data) }),
      delete: (eventId: string, saleId: string) => req<void>(`/api/events/${eventId}/sales/${saleId}`, { method: "DELETE" }),
    },
    communications: {
      list: (eventId: string) => req<EventCommunication[]>(`/api/events/${eventId}/communications`),
      send: (eventId: string, subject: string, body: string) => req<EventCommunication>(`/api/events/${eventId}/communications`, { method: "POST", body: JSON.stringify({ subject, body }) }),
    },
    recurring: {
      list: () => req<RecurringTemplate[]>("/api/events/recurring/templates"),
      create: (data: Partial<RecurringTemplate>) => req<RecurringTemplate>("/api/events/recurring/templates", { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, data: Partial<RecurringTemplate>) => req<RecurringTemplate>(`/api/events/recurring/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      delete: (id: string) => req<void>(`/api/events/recurring/templates/${id}`, { method: "DELETE" }),
      generate: (id: string) => req<EventItem>(`/api/events/recurring/templates/${id}/generate`, { method: "POST" }),
    },
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
