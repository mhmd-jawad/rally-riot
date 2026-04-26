/**
 * REST API client – replaces the Supabase client.
 * All calls go to the Python Flask backend.
 */
const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL || "http://localhost:5001/api");
const LOCAL_API_FALLBACKS = ["http://localhost:5001/api", "http://localhost:5000/api"];

type ApiError = Error & { status?: number; data?: unknown };

function normalizeApiBase(base: string): string {
  return base.replace(/\/+$/, "");
}

function isLocalApiBase(base: string): boolean {
  try {
    const url = new URL(base, window.location.origin);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function getApiBases(): string[] {
  const bases = [API_BASE];
  if (isLocalApiBase(API_BASE)) bases.push(...LOCAL_API_FALLBACKS);
  return Array.from(new Set(bases.map(normalizeApiBase)));
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let lastNetworkError: unknown;

  for (const base of getApiBases()) {
    try {
      return await requestFromBase<T>(base, path, options);
    } catch (error) {
      if (isNetworkError(error) && isLocalApiBase(base)) {
        lastNetworkError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error("Unable to reach the API server.");
}

async function requestFromBase<T = any>(
  base: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${base}${path}`;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json.message || json.error || `Request failed (${res.status})`;
    const err: ApiError = new Error(message);
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
}

// ── Auth ────────────────────────────────────────────────────
export const auth = {
  login: (email: string, password: string) =>
    request<{ success: boolean; data: { token: string; user: any } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, full_name: string, role: string) =>
    request<{ success: boolean; data: { token: string; user: any } }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name, role }),
    }),
  me: () => request<{ success: boolean; data: any }>("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
};

// ── Users ───────────────────────────────────────────────────
export const users = {
  list: () => request<{ success: boolean; data: any[] }>("/users/"),
  get: (id: number) => request<{ success: boolean; data: any }>(`/users/${id}`),
  create: (data: { email: string; password: string; full_name: string; role: string }) =>
    request("/users/", { method: "POST", body: JSON.stringify(data) }),
  assignRole: (userId: number, role: string) =>
    request(`/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  myWallet: () =>
    request<{ success: boolean; data: { wallet_balance: number } }>("/users/me/wallet"),
  topUpWallet: (userId: number, amount: number) =>
    request(`/users/${userId}/wallet`, { method: "PATCH", body: JSON.stringify({ amount }) }),
};

// ── Teams ───────────────────────────────────────────────────
export const teams = {
  list: (includeMembers = false) =>
    request<{ success: boolean; data: any[] }>(`/teams/${includeMembers ? "?members=true" : ""}`),
  myTeams: (includeMembers = false) =>
    request<{ success: boolean; data: any[] }>(`/teams/my${includeMembers ? "?members=true" : ""}`),
  get: (id: number) => request<{ success: boolean; data: any }>(`/teams/${id}`),
  create: (data: { name: string; age_group?: string; skill_level?: string }) =>
    request("/teams/", { method: "POST", body: JSON.stringify(data) }),
  assignCoach: (teamId: number, coachUserId: number) =>
    request(`/teams/${teamId}/coaches`, {
      method: "POST",
      body: JSON.stringify({ coach_user_id: coachUserId }),
    }),
  assignPlayer: (teamId: number, playerUserId: number) =>
    request(`/teams/${teamId}/players`, {
      method: "POST",
      body: JSON.stringify({ player_user_id: playerUserId }),
    }),
  setPriority: (teamId: number, priority_level: number) =>
    request(`/teams/${teamId}/priority`, {
      method: "PATCH",
      body: JSON.stringify({ priority_level }),
    }),
};

// ── Parent-Child ────────────────────────────────────────────
export const parentChild = {
  list: () => request<{ success: boolean; data: any[] }>("/parent-child/"),
  link: (childUserId: number, parentUserId?: number) =>
    request("/parent-child/", {
      method: "POST",
      body: JSON.stringify({
        child_user_id: childUserId,
        ...(parentUserId ? { parent_user_id: parentUserId } : {}),
      }),
    }),
  unlink: (linkId: number) =>
    request(`/parent-child/${linkId}`, { method: "DELETE" }),
};

// ── Events ──────────────────────────────────────────────────
export const events = {
  list: (params?: { teamId?: number; upcoming?: boolean; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.teamId) qs.set("team_id", String(params.teamId));
    if (params?.upcoming) qs.set("upcoming", "true");
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return request<{ success: boolean; data: any[] }>(`/events/${q ? "?" + q : ""}`);
  },
  get: (id: number) => request<{ success: boolean; data: any }>(`/events/${id}`),
  create: (data: any) =>
    request("/events/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: any) =>
    request(`/events/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) =>
    request(`/events/${id}`, { method: "DELETE" }),
  myCalendar: () => request<{ success: boolean; data: any[] }>("/events/my/calendar"),
  childSchedule: (childId: number) =>
    request<{ success: boolean; data: any[] }>(`/events/child/${childId}/schedule`),
  courts: (start?: string, end?: string) => {
    const qs = start && end ? `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` : "";
    return request<{ success: boolean; data: any }>(`/events/courts${qs}`);
  },
  createRecurring: (data: {
    team_id: number; event_type: string; title: string; court: string;
    start_date: string; end_date: string; days_of_week: number[];
    start_hour: number; start_minute: number; duration_minutes: number;
    description?: string;
  }) => request("/events/recurring", { method: "POST", body: JSON.stringify(data) }),
  deleteRecurringSeries: (ruleId: number) =>
    request(`/events/recurring/${ruleId}`, { method: "DELETE" }),
};

// ── Registration ────────────────────────────────────────────
export const registrations = {
  listForms: () =>
    request<{ success: boolean; data: any[] }>("/registrations/forms"),
  getForm: (id: number) =>
    request<{ success: boolean; data: any }>(`/registrations/forms/${id}`),
  createForm: (data: any) =>
    request("/registrations/forms", { method: "POST", body: JSON.stringify(data) }),
  list: (formId?: number) => {
    const qs = formId ? `?form_id=${formId}` : "";
    return request<{ success: boolean; data: any[] }>(`/registrations/${qs}`);
  },
  submit: (data: { form_id: number; player_user_id: number; parent_user_id?: number }) =>
    request("/registrations/", { method: "POST", body: JSON.stringify(data) }),
  updateStatus: (regId: number, status: string) =>
    request(`/registrations/${regId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  uploadWaiver: (regId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request(`/registrations/${regId}/waivers`, {
      method: "POST",
      body: formData,
    });
  },
  listWaivers: (regId: number) =>
    request<{ success: boolean; data: any[] }>(`/registrations/${regId}/waivers`),
};

// ── Invoices ────────────────────────────────────────────────
export const invoices = {
  list: () =>
    request<{ success: boolean; data: { invoices: any[]; summary: any } }>("/invoices/"),
  get: (id: number) =>
    request<{ success: boolean; data: any }>(`/invoices/${id}`),
  markPaid: (id: number) =>
    request(`/invoices/${id}/pay`, { method: "PATCH" }),
  pay: (id: number) =>
    request(`/invoices/${id}/pay`, { method: "PATCH" }),
  getInstallments: (invoiceId: number) =>
    request<{ success: boolean; data: any }>(`/invoices/${invoiceId}/installments`),
  payInstallment: (paymentId: number) =>
    request(`/invoices/installments/${paymentId}/pay`, { method: "PATCH" }),
  createDiscount: (data: { form_id: number; label: string; discount_type: string; value: number }) =>
    request("/invoices/discounts", { method: "POST", body: JSON.stringify(data) }),
  listDiscounts: (formId: number) =>
    request<{ success: boolean; data: any[] }>(`/invoices/discounts/${formId}`),
  deleteDiscount: (discountId: number) =>
    request(`/invoices/discounts/${discountId}`, { method: "DELETE" }),
};

// ── RSVPs ───────────────────────────────────────────────────
export const rsvps = {
  upsert: (data: { event_id: number; player_user_id: number; status: string }) =>
    request("/rsvps/", { method: "POST", body: JSON.stringify(data) }),
  forEvent: (eventId: number) =>
    request<{ success: boolean; data: any[] }>(`/rsvps/event/${eventId}`),
};

// ── Attendance ──────────────────────────────────────────────
export const attendance = {
  mark: (data: { event_id: number; player_user_id: number; status: string; absence_reason?: string }) =>
    request("/attendance/", { method: "POST", body: JSON.stringify(data) }),
  forEvent: (eventId: number) =>
    request<{ success: boolean; data: any[] }>(`/attendance/event/${eventId}`),
  summary: (params?: { team_id?: number; player_id?: number }) => {
    const qs = params ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : "";
    return request<{ success: boolean; data: any }>(`/attendance/summary${qs}`);
  },
};

// ── Announcements ───────────────────────────────────────────
export const announcements = {
  list: (teamId?: number) => {
    const qs = teamId ? `?team_id=${teamId}` : "";
    return request<{ success: boolean; data: any[] }>(`/announcements/${qs}`);
  },
  get: (id: number) =>
    request<{ success: boolean; data: any }>(`/announcements/${id}`),
  create: (data: { team_id: number; title: string; message: string }) =>
    request("/announcements/", { method: "POST", body: JSON.stringify(data) }),
};

// ── Notifications ───────────────────────────────────────────
export const notifications = {
  list: () => request<{ success: boolean; data: any[] }>("/notifications/"),
  sendReminders: () => request<{ success: boolean; message: string }>("/notifications/send-reminders", { method: "POST" }),
  sendPaymentReminders: () => request<{ success: boolean; data: { invoices_notified: number }; message: string }>("/notifications/send-payment-reminders", { method: "POST" }),
  markRead: (id: number) =>
    request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () =>
    request("/notifications/read-all", { method: "PATCH" }),
};

// ── Community Hub ───────────────────────────────────────────
export const community = {
  listPosts: (params?: { team_id?: number; category?: string }) => {
    const qs = params ? "?" + new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString() : "";
    return request<{ success: boolean; data: any[] }>(`/community/posts${qs}`);
  },
  getPost: (id: number) =>
    request<{ success: boolean; data: any }>(`/community/posts/${id}`),
  createPost: (data: {
    team_id: number; title: string; body: string; category: string;
    poll?: { question: string; options: string[] };
  }) => request("/community/posts", { method: "POST", body: JSON.stringify(data) }),
  deletePost: (id: number) =>
    request(`/community/posts/${id}`, { method: "DELETE" }),
  togglePin: (id: number) =>
    request(`/community/posts/${id}/pin`, { method: "PATCH" }),
  createReply: (postId: number, body: string) =>
    request(`/community/posts/${postId}/replies`, {
      method: "POST", body: JSON.stringify({ body }),
    }),
  deleteReply: (replyId: number) =>
    request(`/community/replies/${replyId}`, { method: "DELETE" }),
  vote: (pollId: number, optionId: number) =>
    request(`/community/polls/${pollId}/vote`, {
      method: "POST", body: JSON.stringify({ option_id: optionId }),
    }),
};

// ── AI Chat ─────────────────────────────────────────────────
export const ai = {
  chat: (messages: Array<{ role: string; content: string }>) =>
    request<{ success: boolean; data: { reply: string; role: string } }>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
};

const api = { auth, users, teams, parentChild, events, registrations, invoices, rsvps, attendance, announcements, notifications, community, ai };
export default api;
