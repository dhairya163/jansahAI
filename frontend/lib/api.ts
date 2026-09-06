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
  pattern: { id: string; title: string; title_hi: string; count_30d: number; report_count: number; top_region: string | null } | null;
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

// ── v2: phone line ──────────────────────────────────────────────────────────
export interface PhoneSession {
  session_id: string; status: string | null; phone_masked: string | null; ended_at: string | null;
  case_number: string | null; case_token: string | null;
  handoff: { id: string; status: string; assigned_to: string | null } | null;
}
export const phoneInfo = () => request<{ available: boolean; number: string | null; reason: string | null }>('/api/phone/info');
export const callMe = (phone: string) =>
  request<{ session_id: string; session_token: string; phone_masked: string; status: string }>('/api/phone/callme', {
    method: 'POST', body: JSON.stringify({ phone, consent: true }),
  });
export const phoneSession = (token: string) => request<PhoneSession>('/api/phone/session', { headers: { 'X-Session-Token': token } });

// ── v2: human handoff ───────────────────────────────────────────────────────
export interface HandoffMsg { id: string; sender: 'citizen' | 'human' | 'agent' | 'system'; text: string; at: string; name?: string }
export interface HandoffSummary {
  id: string; status: 'queued' | 'accepted' | 'closed'; channel: 'web' | 'phone'; reason: string | null; urgency: string | null;
  ai_summary: string | null; language: string | null; assigned_to: string | null; created_at: string; accepted_at: string | null;
  case_number: string | null; case_id: string | null; category: string | null; reporter: string | null; phone_masked: string | null;
}
const sessionHeaders = (token: string) => ({ 'X-Session-Token': token });
export const requestHandoffApi = (token: string, reason?: string) =>
  request<{ id: string; status: string; already: boolean }>('/api/handoff', { method: 'POST', headers: sessionHeaders(token), body: JSON.stringify({ reason }) });
export const myHandoff = (token: string) =>
  request<{ handoff: HandoffSummary | null; messages: HandoffMsg[] }>('/api/handoff/mine', { headers: sessionHeaders(token) });
export const sendHandoffMessage = (token: string, id: string, text: string) =>
  request<{ ok: boolean }>(`/api/handoff/${id}/message`, { method: 'POST', headers: sessionHeaders(token), body: JSON.stringify({ text }) });
export const closeMyHandoff = (token: string, id: string) =>
  request<{ ok: boolean }>(`/api/handoff/${id}/close`, { method: 'POST', headers: sessionHeaders(token) });

export const opsHandoffs = (auth: string) => request<{ handoffs: HandoffSummary[] }>('/api/ops/handoffs', { headers: opsHeaders(auth) });
export const opsHandoff = (auth: string, id: string) => request<{ handoff: HandoffSummary; messages: HandoffMsg[] }>(`/api/ops/handoffs/${id}`, { headers: opsHeaders(auth) });
export const opsHandoffAccept = (auth: string, id: string, name: string) =>
  request<{ ok: boolean }>(`/api/ops/handoffs/${id}/accept`, { method: 'POST', headers: opsHeaders(auth), body: JSON.stringify({ name }) });
export const opsHandoffMessage = (auth: string, id: string, text: string) =>
  request<{ ok: boolean }>(`/api/ops/handoffs/${id}/message`, { method: 'POST', headers: opsHeaders(auth), body: JSON.stringify({ text }) });
export const opsHandoffClose = (auth: string, id: string) =>
  request<{ ok: boolean }>(`/api/ops/handoffs/${id}/close`, { method: 'POST', headers: opsHeaders(auth) });
export const opsVerifyCaller = (auth: string, phone: string) =>
  request<{ phone: string; validation_code: string; note: string }>('/api/ops/phone/verify-caller', { method: 'POST', headers: opsHeaders(auth), body: JSON.stringify({ phone }) });
export const opsPhoneNumbers = (auth: string) =>
  request<{ configured: boolean; numbers: { phone_number: string; sid: string }[]; active: string | null }>('/api/ops/phone/numbers', { headers: opsHeaders(auth) });
export const opsBuyNumber = (auth: string) => request<{ number: string }>('/api/ops/phone/buy-number', { method: 'POST', headers: opsHeaders(auth) });

// ── v2: scam radar ──────────────────────────────────────────────────────────
export interface PatternDto {
  id: string; modus: string; category: string | null; category_label: Bi | null;
  title: string; brief: string; title_hi: string; brief_hi: string;
  guidance: { key: string; title: string; body: string }[];
  report_count: number; count_30d: number; count_7d: number; trend: number[];
  regions: { region: string; count: number }[]; identifiers: { kind: string; masked: string; reports: number }[];
  first_seen: string; last_seen: string;
}
export interface RadarStats { reports_30d: number; active_patterns: number; top_region: string | null; fastest: { title: string; change_pct: number | null } | null }
export const fetchPatterns = () => request<{ stats: RadarStats; patterns: PatternDto[] }>('/api/patterns');
