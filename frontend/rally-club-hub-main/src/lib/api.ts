/**
 * REST API client – replaces the Supabase client.
 * All calls go to the Python Flask backend.
 */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

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
  const url = `${API_BASE}${path}`;
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
    const err = new Error(message);
    (err as any).status = res.status;
    (err as any).data = json;
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
    request("/auth/register", {
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
};

// ── Teams ───────────────────────────────────────────────────
export const teams = {
  list: () => request<{ success: boolean; data: any[] }>("/teams/"),
  myTeams: () => request<{ success: boolean; data: any[] }>("/teams/my"),
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
};

// ── Events ──────────────────────────────────────────────────
export const events = {
  list: (teamId?: number) => {
    const qs = teamId ? `?team_id=${teamId}` : "";
    return request<{ success: boolean; data: any[] }>(`/events/${qs}`);
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
  mark: (data: { event_id: number; player_user_id: number; status: string }) =>
    request("/attendance/", { method: "POST", body: JSON.stringify(data) }),
  forEvent: (eventId: number) =>
    request<{ success: boolean; data: any[] }>(`/attendance/event/${eventId}`),
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
  markRead: (id: number) =>
    request(`/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () =>
    request("/notifications/read-all", { method: "PATCH" }),
};

const api = { auth, users, teams, parentChild, events, registrations, invoices, rsvps, attendance, announcements, notifications };
export default api;
