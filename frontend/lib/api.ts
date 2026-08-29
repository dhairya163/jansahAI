export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

// ── realtime ────────────────────────────────────────────────────────────────
export interface SessionInfo {
  client_secret: string; expires_at: number; session_token: string; session_id: string;
  calls_url: string; max_minutes: number; model: string;
}
export const createVoiceSession = () => request<SessionInfo>('/api/realtime/session', { method: 'POST' });

export const endVoiceSession = (sessionToken: string, transcript: { role: string; text: string; at?: string }[]) =>
  request<{ ended: boolean }>('/api/realtime/end', {
    method: 'POST', headers: { 'X-Session-Token': sessionToken }, body: JSON.stringify({ transcript }),
  });

export const callTool = (sessionToken: string, name: string, args: unknown) =>
  request<{ result: Record<string, unknown> }>(`/api/tools/${name}`, {
    method: 'POST', headers: { 'X-Session-Token': sessionToken }, body: JSON.stringify({ args }),
  });

// ── track / case ────────────────────────────────────────────────────────────
export interface Bi { en: string; hi: string }
export interface TimelineLine {
  id: string; type: string; actor: string; en: string; hi: string; when: string;
  artifact_id?: string; artifact_kind?: string; payload?: Record<string, unknown>;
}
export interface CasePayload {
  case: {
    id: string; case_number: string; track: string; category: string; category_label: Bi;
    status: string; status_label: Bi; substatus: string | null; language: string | null;
    anonymous: boolean; amount_lost: number | null; amount_held: number | null;
    fir_number: string | null; virtual_day: number; time_offset_days: number;
    registered_at: string | null; email_on_file: boolean;
  };
  timeline: TimelineLine[];
  artifacts: { id: string; kind: string; label_en: string; label_hi: string; created_at: string; meta?: { platforms?: string[]; body_text?: string } }[];
  next_clock: { step_key: string; in_days_virtual: number; due_date: string; label_en: string; label_hi: string } | null;
  guidance: { key: string; en: { title: string; body: string }; hi: { title: string; body: string } }[];
  demo_mode: boolean;
}

export const requestCaseOtp = (caseNumber: string) =>
  request<{ sent: boolean; phone_masked: string | null; demo_code?: string }>(`/api/cases/${caseNumber}/otp`, { method: 'POST' });

export const verifyCaseOtp = (caseNumber: string, code: string) =>
  request<{ token: string; expires_in: number }>(`/api/cases/${caseNumber}/verify`, {
    method: 'POST', body: JSON.stringify({ code }),
  });

export const fetchCase = (caseNumber: string, token: string) =>
  request<CasePayload>(`/api/cases/${caseNumber}`, { headers: { Authorization: `Bearer ${token}` } });

export const demoAction = (caseNumber: string, token: string, action: 'advance' | 'jump' | 'tick', days?: number) =>
  request<{ offset?: number; fired?: string[] }>(`/api/cases/${caseNumber}/demo/${action}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ days }),
  });

export const artifactUrl = (id: string, token: string) => `${API_BASE}/api/artifacts/${id}?token=${encodeURIComponent(token)}`;

// ── demo picker ─────────────────────────────────────────────────────────────
export interface DemoCase {
  case_number: string; category_label: Bi; status_label: Bi; status: string;
  anonymous: boolean; virtual_day: number; persona: string | null;
}
export const fetchDemoCases = () => request<{ demo_otp: string; cases: DemoCase[] }>('/api/demo/cases');

// ── ops (basic auth header built by caller) ─────────────────────────────────
export interface OpsCase {
  id: string; case_number: string; category: string; category_label: Bi; track: string;
  status: string; status_label: Bi; substatus: string | null; anonymous: boolean;
  amount_lost: number | null; amount_held: number | null; created_at: string; virtual_day: number;
  keep_for_demo: boolean;
  next_clock: { label: string; in_days: number; step_key: string } | null;
}
export interface OpsUsage {
  sessions_today: number; minutes_today: number; emails_today: number; est_cost_inr: number;
  caps: { max_sessions_per_day: number; max_session_minutes: number }; alert: boolean;
}

const opsHeaders = (auth: string) => ({ Authorization: `Basic ${btoa(auth)}` });

export const opsFetchCases = (auth: string, params = '') =>
  request<{ cases: OpsCase[] }>(`/api/ops/cases${params}`, { headers: opsHeaders(auth) });

export const opsFetchCase = (auth: string, id: string) =>
  request<{ case: Record<string, unknown>; timeline: TimelineLine[]; artifacts: { id: string; kind: string; label_en: string }[]; clocks: { step_key: string; due_days: number; condition: string; status: string }[] }>(
    `/api/ops/cases/${id}`, { headers: opsHeaders(auth) });

export const opsAction = (auth: string, id: string, action: string, body: Record<string, unknown> = {}) =>
  request<Record<string, unknown>>(`/api/ops/cases/${id}/${action}`, {
    method: 'POST', headers: opsHeaders(auth), body: JSON.stringify(body),
  });

export const opsUsage = (auth: string) => request<OpsUsage>('/api/ops/usage', { headers: opsHeaders(auth) });
export const opsTick = (auth: string) => request<{ evaluated: number; fired: Record<string, string[]> }>('/api/jobs/tick', { method: 'POST', headers: opsHeaders(auth) });
export const opsArtifactUrl = (id: string) => `${API_BASE}/api/artifacts/${id}`;

export function fmtCase(n: string): string {
  return n.length === 14 ? `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}` : n;
}

export function fmtINR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}
