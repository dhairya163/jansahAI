import { toAsciiDigits } from './redact.js';

/** §15 normalization rules, applied server-side on write. */

export function maskPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = toAsciiDigits(raw).replace(/[^0-9+]/g, '');
  const bare = digits.replace(/^\+?91/, '').replace(/^0/, '');
  if (bare.length < 4) return null;
  return `+91••••••${bare.slice(-4)}`;
}

export function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Kind-aware suspect normalization so "98125 54401", "098125...", "+91 98125-54401"
 * all land on the same repository row (+91XXXXXXXXXX canonical form).
 */
export function normalizeSuspectValue(kind: string, raw: string): string {
  if (kind === 'phone') {
    const digits = toAsciiDigits(raw).replace(/[^0-9]/g, '').replace(/^0+/, '').replace(/^91(?=\d{10}$)/, '');
    return digits.length === 10 ? `+91${digits}` : normalizeIdentifier(raw);
  }
  if (kind === 'url') {
    return normalizeIdentifier(raw).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  }
  return normalizeIdentifier(raw);
}

export function aadhaarLast4(raw: string): string | null {
  const digits = toAsciiDigits(raw).replace(/[^0-9]/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/** ₹ amount → Indian-system words (English). */
export function amountInWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  const whole = Math.floor(n);
  if (whole === 0) return 'Zero rupees';
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const two = (x: number): string => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`);
  const three = (x: number): string => (x >= 100 ? `${ones[Math.floor(x / 100)]} hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
  const parts: string[] = [];
  const crore = Math.floor(whole / 1e7);
  const lakh = Math.floor((whole % 1e7) / 1e5);
  const thousand = Math.floor((whole % 1e5) / 1e3);
  const rest = whole % 1000;
  if (crore) parts.push(`${two(crore)} crore`);
  if (lakh) parts.push(`${two(lakh)} lakh`);
  if (thousand) parts.push(`${two(thousand)} thousand`);
  if (rest) parts.push(three(rest));
  const words = parts.join(' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} rupees`;
}

export function formatINR(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const num = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(num)) return '—';
  return `₹${num.toLocaleString('en-IN')}`;
}
