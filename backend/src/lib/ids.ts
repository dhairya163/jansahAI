import crypto from 'node:crypto';

/** NCRP-style 14-digit case number: YYYYMMDD (IST) + 6 random digits (ADR-11). */
export function generateCaseNumber(now: Date = new Date()): string {
  const ist = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now).replace(/-/g, '');
  const rand = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  return `${ist}${rand}`;
}

export function isCaseNumber(s: string): boolean {
  return /^[0-9]{14}$/.test(s);
}

export function formatCaseNumber(s: string): string {
  // 4-4-6 grouping for display
  return `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8)}`;
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}
