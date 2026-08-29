import { describe, expect, it } from 'vitest';

import { normalizeIncidentTimestamp } from '../src/lib/dateTime.js';

describe('incident timestamp normalization', () => {
  const reference = '2026-08-29T12:00:00.000Z';

  it('resolves Hindi yesterday-night time in Asia/Kolkata', () => {
    expect(normalizeIncidentTimestamp('कल रात को दस बजे', reference)).toBe('2026-08-28T16:30:00.000Z');
  });

  it('resolves Hinglish and Devanagari-digit clock expressions', () => {
    expect(normalizeIncidentTimestamp('kal raat 10 baje', reference)).toBe('2026-08-28T16:30:00.000Z');
    expect(normalizeIncidentTimestamp('कल रात १०:३० बजे', reference)).toBe('2026-08-28T17:00:00.000Z');
  });

  it('keeps valid ISO timestamps canonical and rejects unknown text', () => {
    expect(normalizeIncidentTimestamp('2026-08-28T22:00:00+05:30', reference)).toBe('2026-08-28T16:30:00.000Z');
    expect(normalizeIncidentTimestamp('कभी रात में', reference)).toBeUndefined();
  });
});
