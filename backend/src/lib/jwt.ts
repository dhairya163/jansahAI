import crypto from 'node:crypto';
import { config } from '../config.js';

// Minimal HS256 JWT (payload: {case_id, purpose:'status', exp}) — §19.

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signCaseToken(caseId: string, ttlSeconds = 30 * 60): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    case_id: caseId, purpose: 'status', exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }));
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyCaseToken(token: string): { case_id: string; purpose: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = crypto.createHmac('sha256', config.jwtSecret).update(`${header}.${payload}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.exp !== 'number' || data.exp < Date.now() / 1000) return null;
    if (data.purpose !== 'status' || typeof data.case_id !== 'string') return null;
    return { case_id: data.case_id, purpose: data.purpose };
  } catch {
    return null;
  }
}
