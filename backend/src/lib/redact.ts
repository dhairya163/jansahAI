// §25.2 — redaction applied before ANY persist/log of free text.
// - 12-digit runs (with/without spaces/dashes, incl. Devanagari digits) -> ########last4
// - 13–19-digit runs (card-shaped) -> CARD-REDACTED
// - standalone 6-digit tokens in an OTP context -> OTP-REDACTED

const DEV_ZERO = 0x0966; // ०

export function toAsciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - DEV_ZERO));
}

const D = '[0-9०-९]';
const SEP = '[\\s\\-]';
// 13–19 digits possibly separated by single spaces/dashes
const CARD_RE = new RegExp(`(?<!${D})(?:${D}${SEP}?){12,18}${D}(?!${SEP}?${D})`, 'g');
// exactly 12 digits possibly separated
const TWELVE_RE = new RegExp(`(?<!${D})(?:${D}${SEP}?){11}${D}(?!${SEP}?${D})`, 'g');
const SIX_RE = new RegExp(`(?<!${D})${D}{6}(?!${D})`, 'g');

const OTP_CONTEXT_RE = /\botp\b|one[- ]time|ओटीपी|verification code|\bcode\b|कोड/i;

function digitCount(s: string): number {
  return (s.match(new RegExp(D, 'g')) ?? []).length;
}

export function redact(text: string, opts: { otpContext?: boolean } = {}): string {
  if (!text) return text;
  let out = text;

  // card-shaped first so a 16-digit run isn't partially matched as a 12-digit run
  out = out.replace(CARD_RE, (m) => (digitCount(m) >= 13 ? 'CARD-REDACTED' : m));

  out = out.replace(TWELVE_RE, (m) => {
    if (digitCount(m) !== 12) return m;
    const ascii = toAsciiDigits(m).replace(/[^0-9]/g, '');
    return `########${ascii.slice(-4)}`;
  });

  const otpContext = opts.otpContext ?? OTP_CONTEXT_RE.test(text);
  if (otpContext) out = out.replace(SIX_RE, 'OTP-REDACTED');

  return out;
}

/** Deep-redact every string in a JSON-ish payload. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v);
    return out as unknown as T;
  }
  return value;
}
