import { describe, expect, it } from 'vitest';

import {
  applyIntakeExtraction,
  applyPendingAnswerFallback,
  confirmationReply,
  detectRegistrationConfirmation,
  detectTurnLanguage,
  fallbackExtraction,
  nextRequiredField,
  normalizeSpokenEmail,
  questionReply,
  resolveTurnLanguage,
  type OrchestratorDraft,
} from '../src/agent/orchestrator.js';

const draft = (overrides: Partial<OrchestratorDraft> = {}): OrchestratorDraft => ({
  language: 'en',
  slots: {},
  contact: {},
  ...overrides,
});

describe('voice intake orchestrator', () => {
  it('recognizes substantive language switches without model judgment', () => {
    expect(detectTurnLanguage('मेरा अकाउंट कल हैक हो गया था।', 'en')).toEqual({ language: 'hi', confident: true });
    expect(detectTurnLanguage('Please continue this conversation in English now.', 'hi')).toEqual({ language: 'en', confident: true });
    expect(detectTurnLanguage('Transaction ID one two three four', 'hi')).toEqual({ language: 'hi', confident: false });
    expect(detectTurnLanguage('demo dot reporter at example dot com', 'hi')).toEqual({ language: 'hi', confident: false });
  });

  it('keeps Hindi through identifier-only turns instead of switching to English', () => {
    const identifier = fallbackExtraction('TXN ONE TWO THREE', 'hi');
    expect(identifier.language_confident).toBe(false);
    expect(resolveTurnLanguage('hi', identifier)).toBe('hi');

    const reply = questionReply('hi', 'payee_identifier', 1);
    expect(reply.match(/\?/g)).toHaveLength(1);
    expect(reply).not.toMatch(/What identifier|fill|form/i);
  });

  it('extracts conversation details into the draft and chooses one next field', () => {
    const state = draft();
    const extraction = fallbackExtraction('My fictional Instagram account was hacked yesterday and I lost access.', 'en');
    extraction.category = 'account_takeover';
    extraction.reporter_name = 'Fictional Reporter';
    extraction.email = 'reports@example.test';
    extraction.slots.platforms = ['Instagram'];
    extraction.slots.account_id = 'fictional_handle';
    extraction.slots.when_lost = 'yesterday';
    extraction.slots.recovery_tried = 'password reset';
    extraction.slots.narrative = 'My fictional Instagram account was hacked yesterday and I lost access.';

    const saved = applyIntakeExtraction(state, extraction);
    expect(saved).toEqual(expect.arrayContaining(['category', 'platforms', 'account_id', 'reporter_name', 'email']));
    expect(state.contact.reporter_name).toBe('Fictional Reporter');
    expect(nextRequiredField(state)).toBeNull();
    expect(confirmationReply(state)).not.toMatch(/fill|form|type/i);
  });

  it('binds a plain identifier answer to the one pending backend field', () => {
    const extraction = fallbackExtraction('fictional handle one two three', 'hi');
    expect(extraction.slots.account_id).toBeNull();
    expect(applyPendingAnswerFallback(extraction, 'account_id', 'fictional handle one two three')).toBe(true);
    expect(extraction.slots.account_id).toBe('fictional handle one two three');
  });

  it('does not mistake a long incident sentence for the reporter name', () => {
    const extraction = fallbackExtraction('तो जिसने मेरे पैसे चुराए उनकी UPI ID यही थी', 'hi');
    expect(applyPendingAnswerFallback(extraction, 'reporter_name', 'तो जिसने मेरे पैसे चुराए उनकी UPI ID यही थी')).toBe(false);
    expect(extraction.reporter_name).toBeNull();
  });

  it('normalizes spoken email and requires it before final confirmation', () => {
    expect(normalizeSpokenEmail('demo dot reporter at gmail dot com')).toBe('demo.reporter@gmail.com');
    const state = draft({
      category: 'account_takeover',
      slots: { platforms: ['Instagram'], account_id: 'fictional', when_lost: 'yesterday', recovery_tried: 'reset', narrative: 'A sufficiently detailed fictional account takeover narrative.' },
      contact: { reporter_name: 'Demo Reporter' },
    });
    expect(nextRequiredField(state)).toBe('email');
    expect(questionReply('hi', 'email')).toMatch(/ईमेल/);
  });

  it('uses the original spoken time instead of trusting a conflicting model timestamp', () => {
    const state = draft();
    const extraction = fallbackExtraction('कल रात को दस बजे घटना हुई थी', 'hi');
    extraction.slots.incident_at = '2026-08-29T15:30:00.000Z';
    applyIntakeExtraction(state, extraction, '2026-08-29T12:00:00.000Z', 'कल रात को दस बजे घटना हुई थी');
    expect(state.slots.incident_at).toBe('2026-08-28T16:30:00.000Z');
  });

  it('recognizes Hindi and Hinglish registration confirmations without repeating the prompt', () => {
    expect(detectRegistrationConfirmation('प्लीज कर दो।')).toBe('yes');
    expect(detectRegistrationConfirmation('अब मेरी शिकायत दर्ज कर दीजिए')).toBe('yes');
    expect(detectRegistrationConfirmation('kar do, kar do')).toBe('yes');
    expect(detectRegistrationConfirmation('नहीं, पहले amount बदलो')).toBe('no');
  });

  it('asks about anonymity before collecting sensitive-category details', () => {
    expect(nextRequiredField(draft({ category: 'wc_stalking', language: 'hi-en' }))).toBe('anonymous_choice');
    const reply = questionReply('hi-en', 'anonymous_choice');
    expect(reply.match(/\?/g)).toHaveLength(1);
  });
});
