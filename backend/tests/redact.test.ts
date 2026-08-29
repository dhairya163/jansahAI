import { describe, expect, it } from 'vitest';

import { aadhaarLast4, maskPhone, redactSensitive } from '../src/lib/redact.js';

describe('redaction', () => {
  it('redacts contiguous, spaced, and Devanagari 12-digit identity patterns', () => {
    expect(redactSensitive('1234 5678 9012')).toBe('########9012');
    expect(redactSensitive('१२३४-५६७८-९०१२')).toBe('########9012');
  });

  it('redacts card-shaped values and OTP-context codes', () => {
    expect(redactSensitive('card 4111111111111111')).toContain('CARD-REDACTED');
    expect(redactSensitive('code 424242', 'otp.code')).toBe('code OTP-REDACTED');
  });

  it('stores only masked phone and Aadhaar last four', () => {
    expect(maskPhone('+91 98765 43841')).toBe('+91••••••3841');
    expect(aadhaarLast4('1111 2222 3333')).toBe('3333');
  });
});
