import { describe, expect, it } from 'vitest';

import {
  applyIntakeExtraction,
  applyPendingAnswerFallback,
  confirmationReply,
  detectTurnLanguage,
  fallbackExtraction,
  nextRequiredField,
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
    extraction.slots.platforms = ['Instagram'];
    extraction.slots.account_id = 'fictional_handle';
    extraction.slots.when_lost = 'yesterday';
    extraction.slots.recovery_tried = 'password reset';
    extraction.slots.narrative = 'My fictional Instagram account was hacked yesterday and I lost access.';

    const saved = applyIntakeExtraction(state, extraction);
    expect(saved).toEqual(expect.arrayContaining(['category', 'platforms', 'account_id', 'reporter_name']));
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

  it('asks about anonymity before collecting sensitive-category details', () => {
    expect(nextRequiredField(draft({ category: 'wc_stalking', language: 'hi-en' }))).toBe('anonymous_choice');
    const reply = questionReply('hi-en', 'anonymous_choice');
    expect(reply.match(/\?/g)).toHaveLength(1);
  });
});
