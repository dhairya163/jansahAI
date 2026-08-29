import type { CaseBundle } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data ? (data as { error?: { message?: unknown } }).error : undefined;
    throw new Error(typeof error?.message === 'string' ? error.message : 'Something went wrong. Please try again.');
  }
  return data as T;
}

export const api = {
  register: (body: Record<string, unknown>) => request<{ bundle: CaseBundle; accessToken: string }>('/api/intake/register', { method: 'POST', body: JSON.stringify(body) }),
  sendOtp: (caseNumber: string) => request<{ sent: boolean; phoneMasked: string; demoCode?: string }>(`/api/cases/${caseNumber}/otp`, { method: 'POST' }),
  verifyOtp: (caseNumber: string, code: string) => request<{ token: string; expiresIn: number }>(`/api/cases/${caseNumber}/verify`, { method: 'POST', body: JSON.stringify({ code }) }),
  getCase: (caseNumber: string, token: string) => request<CaseBundle>(`/api/cases/${caseNumber}`, { headers: { Authorization: `Bearer ${token}` } }),
  demoCases: () => request<{ cases: CaseBundle[] }>('/api/demo/cases'),
  advanceDemo: (caseId: string, days: number) => request<CaseBundle>(`/api/demo/cases/${caseId}/advance-time`, { method: 'POST', body: JSON.stringify({ days }) }),
  opsCases: (credentials: string) => request<{ cases: CaseBundle[]; usage: { sessionsToday: number; minutesToday: number; emailsToday: number } }>('/api/ops/cases', { headers: { Authorization: `Basic ${btoa(credentials)}` } }),
  opsAction: (credentials: string, caseId: string, action: string, body: Record<string, unknown>) => request<CaseBundle>(`/api/ops/cases/${caseId}/${action}`, { method: 'POST', headers: { Authorization: `Basic ${btoa(credentials)}` }, body: JSON.stringify(body) }),
  artifactUrl: (artifactId: string, token: string) => `${API_URL}/api/artifacts/${artifactId}?token=${encodeURIComponent(token)}`,
  createVoiceSession: () => request<{ session_token: string; session_id: string; enabled: boolean; model: string; voice: string; maxMinutes: number; expires_at: string }>('/api/realtime/session', { method: 'POST' }),
};

export const caseTokenKey = (caseNumber: string) => `sahai:case:${caseNumber}`;
export const voiceSessionKey = 'jansah:voice-session-id';
export const voiceDraftKey = 'jansah:voice-session-draft';
