import { randomBytes, randomUUID } from 'node:crypto';

export const id = () => randomUUID();

export function caseNumber(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const random = Number.parseInt(randomBytes(4).toString('hex'), 16) % 1_000_000;
  return `${date}${random.toString().padStart(6, '0')}`;
}

export const sessionToken = () => randomBytes(24).toString('base64url');
