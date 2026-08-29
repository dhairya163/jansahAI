import { describe, it, expect } from 'vitest';
import { redact } from '../src/lib/redact.js';
import { generateCaseNumber, isCaseNumber, formatCaseNumber } from '../src/lib/ids.js';
import { canTransition } from '../src/engine/transitions.js';
import { validateSlotPatch, missingSlots } from '../src/engine/slotSchemas.js';
import { playbooks, getPlaybook } from '../src/engine/playbooks.js';
import { GUIDANCE_EN } from '../src/engine/guidance/en.js';
import { GUIDANCE_HI } from '../src/engine/guidance/hi.js';
import { amountInWords, maskPhone, normalizeSuspectValue } from '../src/lib/normalize.js';

describe('redaction §25.2 / §29', () => {
  it('masks 12-digit Aadhaar runs to last 4', () => {
    expect(redact('mera aadhaar 123456789012 hai')).toBe('mera aadhaar ########9012 hai');
  });
  it('handles spaced and dashed 12-digit runs', () => {
    expect(redact('1234 5678 9012')).toBe('########9012');
    expect(redact('1234-5678-9012')).toBe('########9012');
  });
  it('handles Devanagari digits', () => {
    expect(redact('आधार १२३४५६७८९०१२')).toContain('########9012');
  });
  it('redacts 16-digit card-shaped runs entirely', () => {
    expect(redact('card 4111 1111 1111 1111 ok')).toBe('card CARD-REDACTED ok');
    expect(redact('4111111111111111')).toBe('CARD-REDACTED');
  });
  it('redacts standalone 6-digit tokens only in OTP context', () => {
    expect(redact('my otp is 424242')).toBe('my otp is OTP-REDACTED');
    expect(redact('amount was 424242 rupees')).toBe('amount was 424242 rupees');
  });
  it('leaves 10-digit phones and short numbers alone', () => {
    expect(redact('call 9812554401 now')).toBe('call 9812554401 now');
  });
});

describe('case number §15/§29 (ADR-11)', () => {
  it('is 14 digits, IST-dated, 4-4-6 groupable', () => {
    const n = generateCaseNumber(new Date('2026-08-29T20:00:00+05:30'));
    expect(n).toMatch(/^20260829[0-9]{6}$/);
    expect(isCaseNumber(n)).toBe(true);
    expect(formatCaseNumber(n)).toBe(`2026 0829 ${n.slice(8)}`);
  });
  it('rolls the IST date across UTC midnight', () => {
    const n = generateCaseNumber(new Date('2026-08-29T22:00:00Z')); // 03:30 IST next day
    expect(n.startsWith('20260830')).toBe(true);
  });
});

describe('state machine §16.2', () => {
  it('allows the legal ladder', () => {
    expect(canTransition('draft', 'registered')).toBe(true);
    expect(canTransition('registered', 'under_process')).toBe(true);
    expect(canTransition('under_process', 'stalled')).toBe(true);
    expect(canTransition('stalled', 'escalated_l1')).toBe(true);
    expect(canTransition('escalated_l1', 'escalated_l2')).toBe(true);
    expect(canTransition('stalled', 'fir_registered')).toBe(true);
    expect(canTransition('fir_registered', 'resolved')).toBe(true);
    expect(canTransition('under_process', 'withdrawn')).toBe(true);
  });
  it('rejects illegal transitions (5 samples → 409 upstream)', () => {
    expect(canTransition('draft', 'stalled')).toBe(false);
    expect(canTransition('resolved', 'under_process')).toBe(false);
    expect(canTransition('closed', 'registered')).toBe(false);
    expect(canTransition('withdrawn', 'fir_registered')).toBe(false);
    expect(canTransition('registered', 'escalated_l2')).toBe(false);
  });
});

describe('slot validation §17.2', () => {
  it('accepts a valid financial patch and coerces string amounts', () => {
    const { saved, rejected } = validateSlotPatch({
      amount: '48,000', instrument: 'upi',
      txns: [{ amount: '30000', ref: 'ABC' }, { amount: 18000 }],
      narrative: 'Parcel scam call, paid twice via UPI under pressure from fake customs officer.',
    });
    expect(rejected).toEqual({});
    expect(saved.amount).toBe(48000);
    expect((saved.txns as { amount: number }[])[0].amount).toBe(30000);
  });
  it('coerces messy voice-model shapes without inventing data', () => {
    const { saved, rejected } = validateSlotPatch({
      amount: '1 lakh',                                          // spoken amount
      instrument: 'net banking',                                 // synonym → canonical
      suspect_contacts: [{ name: 'Rahul', number: 1234567890 }], // wrong keys + numeric value (the [object Object] bug)
      numbers: '98125 54401',                                    // bare string where array expected
      txns: { amount: '₹1,00,000' },                             // single object where array expected
    });
    expect(rejected).toEqual({});
    expect(saved.amount).toBe(100000);
    expect(saved.instrument).toBe('netbanking');
    expect(saved.suspect_contacts).toEqual([{ kind: 'phone', value: '1234567890' }]);
    expect(saved.numbers).toEqual(['98125 54401']);
    expect(saved.txns).toEqual([{ amount: 100000 }]);
  });
  it('amount words: lakh/crore/hazaar parse mechanically', () => {
    expect(validateSlotPatch({ amount: '1.5 lakh' }).saved.amount).toBe(150000);
    expect(validateSlotPatch({ amount: '2 crore' }).saved.amount).toBe(20000000);
    expect(validateSlotPatch({ amount: '48 hazaar' }).saved.amount).toBe(48000);
  });
  it('suspect kind inference follows shape only', () => {
    const got = validateSlotPatch({
      suspect_contacts: ['quickhelp.desk@okpay', 'scam@gmail.com', 'https://kyc-update-sbi.in', '@fake_handle', '9812554401'],
    }).saved.suspect_contacts as { kind: string; value: string }[];
    expect(got.map((s) => s.kind)).toEqual(['upi', 'email', 'url', 'handle', 'phone']);
  });
  it('rejects bad values with reasons', () => {
    const { saved, rejected } = validateSlotPatch({ amount: -5, narrative: 'too short' });
    expect(saved.amount).toBeUndefined();
    expect(Object.keys(rejected)).toContain('amount');
    expect(Object.keys(rejected)).toContain('narrative');
  });
  it('missingSlots respects optional suspect_contacts', () => {
    const pb = getPlaybook('financial_upi')!;
    const missing = missingSlots(pb.slots, {
      amount: 1, incident_at: 'x', instrument: 'upi',
      txns: [{ amount: 1 }], payee_identifier: 'a@b', own_bank: 'SBI',
      narrative: 'a'.repeat(40),
    });
    expect(missing).toEqual([]);
  });
  it('vishing fast path: unknown payee/txns never block a financial registration', () => {
    const pb = getPlaybook('financial_upi')!;
    const missing = missingSlots(pb.slots, {
      amount: 100000, incident_at: 'just now', instrument: 'upi',
      own_bank: 'State Bank of India',
      narrative: 'Fake SBI KYC call took an OTP and one lakh was debited immediately after.',
    });
    expect(missing).toEqual([]);
  });
});

describe('playbook catalogue §17.3/§17.4', () => {
  it('covers all 22 categories', () => {
    expect(Object.keys(playbooks)).toHaveLength(22);
  });
  it('every guidance key referenced by a playbook exists in EN and HI', () => {
    for (const [name, pb] of Object.entries(playbooks)) {
      for (const key of pb.guidance) {
        expect(GUIDANCE_EN[key], `${name} → EN ${key}`).toBeDefined();
        expect(GUIDANCE_HI[key], `${name} → HI ${key}`).toBeDefined();
      }
      for (const clk of pb.clocks) {
        for (const a of clk.actions) {
          if (a.do === 'offer') expect(GUIDANCE_EN[a.key], `${name} offer ${a.key}`).toBeDefined();
        }
      }
    }
  });
  it('anonymous is only allowed on the women/children track', () => {
    for (const pb of Object.values(playbooks)) {
      if (pb.anonymousAllowed) expect(pb.track).toBe('women_children');
    }
  });
});

describe('normalize', () => {
  it('masks phones to +91••••••last4', () => {
    expect(maskPhone('+91 98125 54401')).toBe('+91••••••4401');
    expect(maskPhone('09812554401')).toBe('+91••••••4401');
  });
  it('suspect phone forms all normalize to one canonical row', () => {
    for (const raw of ['98125 54401', '098125-54401', '+91 98125 54401', '919812554401']) {
      expect(normalizeSuspectValue('phone', raw)).toBe('+919812554401');
    }
    expect(normalizeSuspectValue('url', 'https://www.kyc-update-sbi.in/')).toBe('kyc-update-sbi.in');
    expect(normalizeSuspectValue('upi', ' QuickHelp.Desk@okpay ')).toBe('quickhelp.desk@okpay');
  });
  it('Indian amount words', () => {
    expect(amountInWords(48000)).toBe('Forty eight thousand rupees');
    expect(amountInWords(1050000)).toBe('Ten lakh fifty thousand rupees');
    expect(amountInWords(20000000)).toBe('Two crore rupees');
  });
});
