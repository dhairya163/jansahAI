import type { Playbook } from '../domain/types.js';

const financial: Playbook = {
  track: 'financial',
  slots: ['amount', 'incident_at', 'instrument', 'txns', 'payee_identifier', 'own_bank', 'suspect_contacts', 'narrative'],
  immediate: [
    { do: 'artifact', kind: 'complaint_pdf' },
    { do: 'artifact', kind: 'bank_notice' },
    { do: 'mock_freeze_request' },
    { do: 'suspect_lookup' },
    { do: 'ezero_fir_check' },
    { do: 'status', to: 'under_process' },
  ],
  clocks: [
    { key: 'bank_followup', afterDays: 7, condition: 'no_freeze_confirmation', actions: [{ do: 'email', template: 'nudge' }, { do: 'offer', key: 'bank_escalate_rbios' }] },
    { key: 'fir_check', afterDays: 15, condition: 'no_fir', actions: [{ do: 'artifact', kind: 'fir_pack' }, { do: 'email', template: 'nudge' }, { do: 'status', to: 'stalled' }] },
    { key: 'sp_escalation', afterDays: 29, condition: 'no_fir', actions: [{ do: 'artifact', kind: 'sp_letter' }, { do: 'email', template: 'escalation' }, { do: 'status', to: 'escalated_l1' }] },
    { key: 'status_rti', afterDays: 30, condition: 'always', actions: [{ do: 'offer', key: 'status_rti' }] },
    { key: 'magistrate', afterDays: 43, condition: 'no_fir', actions: [{ do: 'artifact', kind: 'magistrate_draft' }, { do: 'email', template: 'escalation' }, { do: 'status', to: 'escalated_l2' }] },
  ],
  guidance: ['golden_hour', 'bank_3day_rule', 'ezero_fir', 'freeze_meaning', 'restoration_path', 'evidence_basics', 'fir_ladder', 'zero_fir_any_ps'],
};

const fin = (extraSlots: string[] = [], extraGuidance: string[] = [], sensitive = false): Playbook => ({
  ...financial,
  sensitive,
  slots: [...financial.slots, ...extraSlots],
  guidance: [...financial.guidance, ...extraGuidance],
});

const firClock = (days = 15) => ({ key: 'fir_check', afterDays: days, condition: 'no_fir' as const, actions: [{ do: 'artifact' as const, kind: 'fir_pack' as const }, { do: 'status' as const, to: 'stalled' as const }] });

export const playbooks: Record<string, Playbook> = {
  financial_upi: fin(),
  financial_card: fin([], ['card_block_now', 'simswap_check']),
  financial_netbanking: fin([], ['credential_rotation']),
  financial_wallet: fin(),
  financial_investment: fin(['platform_name', 'total_invested'], ['investment_no_more_deposits']),
  financial_loan_app: fin(['app_name'], ['loanapp_harassment', 'loanapp_warn_contacts']),
  financial_job_fraud: fin(),
  financial_courier_customs: fin([], ['digital_arrest_truths']),
  financial_matrimonial: fin(),
  financial_crypto: fin(['wallet_addresses', 'exchange'], ['crypto_exchange_report']),
  financial_bec: fin([], ['bec_bank_recall', 'credential_rotation']),
  financial_sextortion_paid: fin([], ['ncii_stopncii', 'ncii_do_not_pay', 'evidence_capture_ncii'], true),
  digital_arrest_paid: fin([], ['digital_arrest_truths']),
  wc_ncii: {
    track: 'women_children', anonymousAllowed: true, sensitive: true,
    slots: ['platforms', 'urls', 'first_seen_at', 'suspect_handles', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'artifact', kind: 'takedown_letter' }, { do: 'status', to: 'under_process' }],
    clocks: [
      { key: 'platform_ack', afterDays: 1, condition: 'no_platform_ack', actions: [{ do: 'email', template: 'nudge' }] },
      { key: 'gac', afterDays: 15, condition: 'content_not_removed', actions: [{ do: 'artifact', kind: 'gac_note' }, { do: 'email', template: 'nudge' }] },
      firClock(),
      { key: 'sp_escalation', afterDays: 29, condition: 'no_fir', actions: [{ do: 'artifact', kind: 'sp_letter' }, { do: 'status', to: 'escalated_l1' }] },
    ],
    guidance: ['ncii_takedown_24h', 'ncii_stopncii', 'ncii_do_not_pay', 'evidence_capture_ncii', 'gac_path', 'helpline_181', 'fir_ladder'],
  },
  wc_csam_report: {
    track: 'women_children', anonymousAllowed: true, sensitive: true,
    slots: ['urls', 'platforms', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'status', to: 'under_process' }],
    clocks: [firClock(7)], guidance: ['csam_do_not_download', 'csam_urls_only', 'fir_ladder'],
  },
  wc_stalking: {
    track: 'women_children', anonymousAllowed: true, sensitive: true,
    slots: ['platforms', 'suspect_handles', 'first_seen_at', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'artifact', kind: 'takedown_letter' }, { do: 'status', to: 'under_process' }],
    clocks: [{ key: 'platform_ack', afterDays: 1, condition: 'no_platform_ack', actions: [{ do: 'email', template: 'nudge' }] }, firClock()],
    guidance: ['evidence_capture_ncii', 'helpline_181', 'fir_ladder', 'gac_path'],
  },
  social_impersonation: {
    track: 'other', slots: ['platforms', 'urls', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'artifact', kind: 'takedown_letter' }, { do: 'suspect_lookup' }, { do: 'status', to: 'under_process' }],
    clocks: [{ key: 'platform_ack', afterDays: 1, condition: 'no_platform_ack', actions: [{ do: 'email', template: 'nudge' }] }, { key: 'gac', afterDays: 15, condition: 'content_not_removed', actions: [{ do: 'artifact', kind: 'gac_note' }] }, firClock()],
    guidance: ['impersonation_warn_contacts', 'takedown_24h_impersonation', 'gac_path', 'fir_ladder'],
  },
  account_takeover: {
    track: 'other', slots: ['platforms', 'account_id', 'when_lost', 'recovery_tried', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'artifact', kind: 'certin_email' }, { do: 'status', to: 'under_process' }], clocks: [firClock()],
    guidance: ['recovery_checklist', 'credential_rotation', 'certin_what', 'fir_ladder'],
  },
  hacking_ransomware: {
    track: 'other', slots: ['system_affected', 'ransom_note', 'when', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'artifact', kind: 'certin_email' }, { do: 'status', to: 'under_process' }], clocks: [firClock()],
    guidance: ['ransom_do_not_pay', 'decryptor_check', 'isolate_machine', 'certin_what', 'fir_ladder'],
  },
  telecom_fraud: {
    track: 'other', slots: ['numbers', 'message_samples', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'suspect_lookup' }, { do: 'status', to: 'under_process' }], clocks: [],
    guidance: ['chakshu_how', 'tafcop_how', 'simswap_check'],
  },
  digital_arrest_no_loss: {
    track: 'other', slots: ['caller_claims', 'numbers', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'suspect_lookup' }, { do: 'status', to: 'under_process' }], clocks: [],
    guidance: ['digital_arrest_truths', 'chakshu_how'],
  },
  generic_other: {
    track: 'other', slots: ['narrative', 'when', 'suspect_contacts'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'status', to: 'under_process' }],
    clocks: [firClock(), { key: 'status_rti', afterDays: 30, condition: 'always', actions: [{ do: 'offer', key: 'status_rti' }] }],
    guidance: ['evidence_basics', 'fir_ladder', 'zero_fir_any_ps'],
  },
};

export const categoryLabels: Record<string, string> = {
  financial_upi: 'UPI fraud', financial_card: 'Card fraud', financial_netbanking: 'Internet banking fraud', financial_wallet: 'Wallet fraud',
  financial_investment: 'Investment scam', financial_loan_app: 'Loan app extortion', financial_job_fraud: 'Job fraud',
  financial_courier_customs: 'Courier or customs scam', financial_matrimonial: 'Matrimonial fraud', financial_crypto: 'Cryptocurrency fraud',
  financial_bec: 'Business email compromise', financial_sextortion_paid: 'Sextortion with financial loss', digital_arrest_paid: 'Digital arrest with financial loss',
  wc_ncii: 'Intimate-image abuse / sextortion', wc_csam_report: 'Child sexual abuse material report', wc_stalking: 'Cyberstalking or harassment',
  social_impersonation: 'Fake profile or impersonation', account_takeover: 'Account takeover', hacking_ransomware: 'Hacking or ransomware',
  telecom_fraud: 'Suspicious call, SMS, or SIM fraud', digital_arrest_no_loss: 'Digital arrest attempt', generic_other: 'Other cybercrime',
};
