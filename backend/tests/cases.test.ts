import { beforeEach, describe, expect, it } from 'vitest';

import { repository } from '../src/db/repository.js';
import { mutateCase, registerCase } from '../src/services/cases.js';

beforeEach(async () => { await repository.reset?.(); });

describe('case engine', () => {
  it('registers a financial case with a 14-digit number, immediate artifacts, and clocks', async () => {
    const result = await registerCase({ category: 'financial_upi', reporterName: 'Demo Person', phone: '9876543841', aadhaar: '111122223333', narrative: 'A scammer asked for a fictional UPI transfer and I sent the demo payment.', amount: 48000, slots: { own_bank: 'Demo Bank', payee_identifier: 'fraud@upi', txns: [] } });
    expect(result.bundle.case.caseNumber).toMatch(/^\d{14}$/);
    expect(result.bundle.case.status).toBe('under_process');
    expect(result.bundle.artifacts.map((item) => item.kind)).toEqual(expect.arrayContaining(['complaint_pdf', 'bank_notice']));
    expect(result.bundle.clocks).toHaveLength(5);
  });

  it('keeps anonymous sensitive filing identity-free', async () => {
    const result = await registerCase({ category: 'wc_ncii', anonymous: true, narrative: 'A fictional account shared private images without consent on a demo platform.', slots: { platforms: ['Demo'], urls: ['https://example.test/demo'] } });
    expect(result.bundle.case.reporterName).toBeUndefined();
    expect(result.bundle.case.aadhaarLast4).toBeUndefined();
    expect(result.bundle.timeline.some((event) => event.type === 'identity_skipped_anonymous')).toBe(true);
  });

  it('fires the day-15 FIR clock once and guards invalid transitions', async () => {
    const result = await registerCase({ category: 'financial_upi', reporterName: 'Demo Person', narrative: 'A detailed fictional financial scam narrative suitable for the case engine.', amount: 5000, slots: { own_bank: 'Demo Bank' } });
    const advanced = await mutateCase(result.bundle.case.id, 'advance-time', { days: 15 });
    expect(advanced.case.status).toBe('stalled');
    expect(advanced.artifacts.filter((item) => item.kind === 'fir_pack')).toHaveLength(1);
    const advancedAgain = await mutateCase(result.bundle.case.id, 'advance-time', { days: 1 });
    expect(advancedAgain.artifacts.filter((item) => item.kind === 'fir_pack')).toHaveLength(1);
    await mutateCase(result.bundle.case.id, 'resolve', { note: 'done' });
    await expect(mutateCase(result.bundle.case.id, 'mark-fir', { firNumber: 'FIR-DEMO' })).rejects.toMatchObject({ statusCode: 409 });
  });
});
