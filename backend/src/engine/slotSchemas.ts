import { z } from 'zod';

/** §17.2 slot dictionary — zod schemas, one per slot key. */

const txn = z.object({
  ref: z.string().optional(),
  amount: z.number().positive(),
  at: z.string().optional(),          // datetime-ish, kept lenient for voice input
  method: z.string().optional(),
});

const suspectContact = z.object({
  kind: z.enum(['phone', 'upi', 'bank_account', 'url', 'email', 'handle']),
  value: z.string().min(2),
});

export const SLOT_SCHEMAS = {
  amount: z.number().positive(),
  txns: z.array(txn).min(1),
  payee_identifier: z.string().min(3),
  own_bank: z.string().min(2),
  instrument: z.enum(['upi', 'card', 'netbanking', 'wallet', 'cash_deposit', 'crypto']),
  suspect_contacts: z.array(suspectContact),
  narrative: z.string().min(30),
  incident_at: z.string().min(4),
  platforms: z.array(z.string().min(2)).min(1),
  urls: z.array(z.string().min(4)).min(1),
  suspect_handles: z.array(z.string().min(2)).min(1),
  first_seen_at: z.string().min(4),
  app_name: z.string().min(2),
  platform_name: z.string().min(2),
  total_invested: z.number().positive(),
  wallet_addresses: z.array(z.string().min(6)).min(1),
  exchange: z.string().min(2),
  account_id: z.string().min(2),
  when_lost: z.string().min(2),
  recovery_tried: z.union([z.boolean(), z.string()]),
  system_affected: z.string().min(2),
  ransom_note: z.string().min(2),
  caller_claims: z.string().min(2),
  numbers: z.array(z.string().min(6)).min(1),
  message_samples: z.array(z.string().min(2)).min(1),
  when: z.string().min(2),
} as const;

export type SlotKey = keyof typeof SLOT_SCHEMAS;

/** Slots that are optional extras in every category ('?' marked in §17).
 *  payee_identifier/txns are optional too: a vishing/OTP-fraud victim often has no idea
 *  where the money went or what the reference was — that must never block registration. */
export const OPTIONAL_SLOTS: Set<string> = new Set(['suspect_contacts', 'payee_identifier', 'txns']);

export interface SlotValidation {
  saved: Record<string, unknown>;
  rejected: Record<string, string>;
}

/** Validate a patch against the slot dictionary; unknown keys are kept as-is (model may store helper context). */
export function validateSlotPatch(patch: Record<string, unknown>): SlotValidation {
  const saved: Record<string, unknown> = {};
  const rejected: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    const schema = (SLOT_SCHEMAS as Record<string, z.ZodTypeAny>)[key];
    if (!schema) { saved[key] = value; continue; }
    const res = schema.safeParse(coerce(key, value));
    if (res.success) saved[key] = res.data;
    else rejected[key] = res.error.issues.map((i) => i.message).join('; ');
  }
  return { saved, rejected };
}

/* ── lenient, purely-mechanical coercion ───────────────────────────────────────
   Voice models send slightly misshapen data ("1 lakh", value as a number,
   {name, number} instead of {kind, value}, a bare string where an array is due).
   We normalize the SHAPE without inventing content — nothing is hallucinated,
   nothing valid is dropped. Anything unfixable still lands in `rejected`. */

const SUSPECT_KINDS = ['phone', 'upi', 'bank_account', 'url', 'email', 'handle'] as const;
const ARRAY_OF_STRING_KEYS = new Set(['platforms', 'urls', 'suspect_handles', 'numbers', 'message_samples', 'wallet_addresses']);
const DEV_DIGITS = /[०-९]/g;

const asciiDigits = (s: string) => s.replace(DEV_DIGITS, (d) => String(d.charCodeAt(0) - 0x0966));

/** "1 lakh" / "1.5 lakh" / "2 crore" / "₹48,000" / "48 hazaar" → rupees. Mechanical only. */
export function parseAmount(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return undefined;
  const t = asciiDigits(raw).toLowerCase().replace(/[₹,]/g, '').trim();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lakhs|lac|lacs|thousand|hazaar|hazar|k)?/);
  if (!m) return undefined;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return undefined;
  const mult = { crore: 1e7, cr: 1e7, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, thousand: 1e3, hazaar: 1e3, hazar: 1e3, k: 1e3 }[m[2] ?? ''] ?? 1;
  return base * mult;
}

/** Infer a suspect-identifier kind from its shape (never from imagination). */
export function inferSuspectKind(value: string): typeof SUSPECT_KINDS[number] {
  const v = value.trim().toLowerCase();
  if (/^(https?:\/\/|www\.)/.test(v)) return 'url';
  if (v.startsWith('@')) return 'handle';
  if (v.includes('@')) {
    const domain = v.split('@')[1] ?? '';
    return domain.includes('.') ? 'email' : 'upi';   // name@bank (no TLD) = UPI VPA
  }
  if (/\.[a-z]{2,6}(\/|$)/.test(v)) return 'url';    // bare domain like kyc-update-sbi.in
  const digits = asciiDigits(v).replace(/[^0-9]/g, '');
  if (digits.length >= 8 && digits.length <= 13) return 'phone';
  if (digits.length >= 14 && digits.length <= 18) return 'bank_account';
  return 'handle';
}

function coerceSuspectContact(item: unknown): { kind: string; value: string } | null {
  if (typeof item === 'string' || typeof item === 'number') {
    const value = String(item).trim();
    return value.length >= 2 ? { kind: inferSuspectKind(value), value } : null;
  }
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const raw = o.value ?? o.number ?? o.phone ?? o.mobile ?? o.contact ?? o.upi ?? o.upi_id ?? o.id
      ?? o.handle ?? o.url ?? o.email ?? o.account ?? o.identifier;
    if (raw === undefined || raw === null) return null;
    const value = String(raw).trim();
    if (value.length < 2) return null;
    const kind = typeof o.kind === 'string' && (SUSPECT_KINDS as readonly string[]).includes(o.kind)
      ? o.kind : inferSuspectKind(value);
    return { kind, value };
  }
  return null;
}

const INSTRUMENT_MAP: [RegExp, string][] = [
  [/upi|gpay|google pay|phonepe|phone pe|paytm upi|bhim/, 'upi'],
  [/card|debit|credit|atm/, 'card'],
  [/net ?banking|internet banking|online banking|neft|rtgs|imps|bank transfer/, 'netbanking'],
  [/wallet/, 'wallet'],
  [/cash/, 'cash_deposit'],
  [/crypto|bitcoin|usdt|btc|eth/, 'crypto'],
];

function coerce(key: string, value: unknown): unknown {
  if (key === 'amount' || key === 'total_invested') {
    return parseAmount(value) ?? value;
  }
  if (key === 'instrument' && typeof value === 'string') {
    const v = value.trim().toLowerCase();
    for (const [re, canon] of INSTRUMENT_MAP) if (re.test(v)) return canon;
    return v;
  }
  if (key === 'txns') {
    const arr = Array.isArray(value) ? value : (value && typeof value === 'object' ? [value] : value);
    if (!Array.isArray(arr)) return value;
    return arr.map((t) => {
      if (t && typeof t === 'object') {
        const o = t as Record<string, unknown>;
        const amount = parseAmount(o.amount) ?? o.amount;
        return {
          ...o,
          amount,
          ...(o.ref !== undefined && o.ref !== null ? { ref: String(o.ref) } : {}),
          ...(o.at !== undefined && o.at !== null ? { at: String(o.at) } : {}),
        };
      }
      // a bare number/string in a txns array = an amount
      const amount = parseAmount(t);
      return amount !== undefined ? { amount } : t;
    });
  }
  if (key === 'suspect_contacts') {
    const arr = Array.isArray(value) ? value : [value];
    const out = arr.map(coerceSuspectContact).filter((x): x is { kind: string; value: string } => x !== null);
    return out.length > 0 ? out : value;
  }
  if (ARRAY_OF_STRING_KEYS.has(key)) {
    const arr = Array.isArray(value) ? value : [value];
    return arr.filter((x) => x !== null && x !== undefined).map((x) => String(x).trim()).filter((x) => x.length > 0);
  }
  // stringly-typed free fields: accept numbers/dates the model sends raw
  if (typeof value === 'number' && ['incident_at', 'when', 'when_lost', 'first_seen_at', 'account_id', 'ransom_note'].includes(key)) {
    return String(value);
  }
  return value;
}

/** Which required slots are still missing for a category's slot list. */
export function missingSlots(required: readonly string[], slots: Record<string, unknown>): string[] {
  return required.filter((k) => !OPTIONAL_SLOTS.has(k) && (slots[k] === undefined || slots[k] === null || slots[k] === ''));
}
