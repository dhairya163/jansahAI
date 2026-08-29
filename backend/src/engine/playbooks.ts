import type { SlotKey } from './slotSchemas.js';

/** §17 playbook system — types + EVERY category config + guidance keys. */

export type Track = 'financial' | 'women_children' | 'other';
export type CaseStatus =
  | 'draft' | 'registered' | 'under_process' | 'stalled' | 'escalated_l1'
  | 'escalated_l2' | 'fir_registered' | 'resolved' | 'withdrawn' | 'closed';

export type ArtifactKind =
  | 'complaint_pdf' | 'bank_notice' | 'fir_pack' | 'sp_letter' | 'magistrate_draft'
  | 'takedown_letter' | 'certin_email' | 'gac_note' | 'restoration_request';

export type EmailTemplate = 'ack' | 'status' | 'nudge' | 'escalation' | 'restoration';
export type GuidanceKey = string;

export type Handler =
  | { do: 'artifact'; kind: ArtifactKind }              // generate + attach + event
  | { do: 'email'; template: EmailTemplate }            // to complainant (+ops bcc)
  | { do: 'mock_freeze_request' }                       // event + substatus, awaits ops
  | { do: 'suspect_lookup' }                            // check all suspect slots
  | { do: 'ezero_fir_check' }                           // amount>=1e6 → notice event
  | { do: 'offer'; key: GuidanceKey }                   // event rendered as CTA card
  | { do: 'status'; to: CaseStatus };

export type ClockCondition =
  | 'no_fir' | 'no_freeze_confirmation' | 'no_platform_ack' | 'content_not_removed' | 'always';

export interface Clock {
  key: string;
  afterDays: number;
  condition: ClockCondition;
  actions: Handler[];
}

export interface Playbook {
  track: Track;
  anonymousAllowed?: boolean;
  sensitive?: boolean;
  slots: SlotKey[];            // required set; optional extras marked in OPTIONAL_SLOTS
  immediate: Handler[];
  clocks: Clock[];
  guidance: GuidanceKey[];
}

const FIN_BASE: Playbook = {
  track: 'financial',
  slots: ['amount', 'incident_at', 'instrument', 'txns', 'payee_identifier', 'own_bank',
    'suspect_contacts', 'narrative'],
  immediate: [
    { do: 'artifact', kind: 'complaint_pdf' },
    { do: 'artifact', kind: 'bank_notice' },
    { do: 'mock_freeze_request' },
    { do: 'suspect_lookup' },
    { do: 'ezero_fir_check' },
    { do: 'status', to: 'under_process' },
  ],
  clocks: [
    { key: 'bank_followup', afterDays: 7, condition: 'no_freeze_confirmation',
      actions: [{ do: 'email', template: 'nudge' }, { do: 'offer', key: 'bank_escalate_rbios' }] },
    { key: 'fir_check', afterDays: 15, condition: 'no_fir',
      actions: [{ do: 'artifact', kind: 'fir_pack' }, { do: 'email', template: 'nudge' }, { do: 'status', to: 'stalled' }] },
    { key: 'sp_escalation', afterDays: 29, condition: 'no_fir',
      actions: [{ do: 'artifact', kind: 'sp_letter' }, { do: 'email', template: 'escalation' }, { do: 'status', to: 'escalated_l1' }] },
    { key: 'magistrate', afterDays: 43, condition: 'no_fir',
      actions: [{ do: 'artifact', kind: 'magistrate_draft' }, { do: 'email', template: 'escalation' }, { do: 'status', to: 'escalated_l2' }] },
    { key: 'status_rti', afterDays: 30, condition: 'always',
      actions: [{ do: 'offer', key: 'status_rti' }] },
  ],
  guidance: ['golden_hour', 'bank_3day_rule', 'ezero_fir', 'freeze_meaning', 'restoration_path',
    'evidence_basics', 'fir_ladder', 'zero_fir_any_ps'],
};

const fin = (over: Partial<Playbook> & { extraSlots?: SlotKey[]; extraGuidance?: GuidanceKey[] } = {}): Playbook => {
  const { extraSlots, extraGuidance, ...rest } = over;
  return {
    ...FIN_BASE,
    ...rest,
    slots: [...FIN_BASE.slots, ...(extraSlots ?? [])],
    guidance: [...FIN_BASE.guidance, ...(extraGuidance ?? [])],
  };
};

export const playbooks: Record<string, Playbook> = {
  financial_upi: fin({}),
  financial_card: fin({ extraGuidance: ['card_block_now', 'simswap_check'] }),
  financial_netbanking: fin({ extraGuidance: ['credential_rotation'] }),
  financial_wallet: fin({}),
  financial_investment: fin({ extraSlots: ['platform_name', 'total_invested'],
    extraGuidance: ['investment_no_more_deposits'] }),
  financial_loan_app: fin({ extraSlots: ['app_name'],
    extraGuidance: ['loanapp_harassment', 'loanapp_warn_contacts'] }),
  financial_job_fraud: fin({}),
  financial_courier_customs: fin({ extraGuidance: ['digital_arrest_truths'] }),
  financial_matrimonial: fin({}),
  financial_crypto: fin({ extraSlots: ['wallet_addresses', 'exchange'],
    extraGuidance: ['crypto_exchange_report'] }),
  financial_bec: fin({ extraGuidance: ['bec_bank_recall', 'credential_rotation'] }),
  financial_sextortion_paid: fin({ sensitive: true,
    extraGuidance: ['ncii_stopncii', 'ncii_do_not_pay', 'evidence_capture_ncii'] }),
  digital_arrest_paid: fin({ extraGuidance: ['digital_arrest_truths'] }),

  wc_ncii: {
    track: 'women_children', anonymousAllowed: true, sensitive: true,
    slots: ['platforms', 'urls', 'first_seen_at', 'suspect_handles', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'artifact', kind: 'takedown_letter' },
      { do: 'status', to: 'under_process' }],
    clocks: [
      { key: 'platform_ack', afterDays: 1, condition: 'no_platform_ack',
        actions: [{ do: 'email', template: 'nudge' }] },
      { key: 'gac', afterDays: 15, condition: 'content_not_removed',
        actions: [{ do: 'artifact', kind: 'gac_note' }, { do: 'email', template: 'nudge' }] },
      { key: 'fir_check', afterDays: 15, condition: 'no_fir',
        actions: [{ do: 'artifact', kind: 'fir_pack' }, { do: 'status', to: 'stalled' }] },
      { key: 'sp_escalation', afterDays: 29, condition: 'no_fir',
        actions: [{ do: 'artifact', kind: 'sp_letter' }, { do: 'status', to: 'escalated_l1' }] },
    ],
    guidance: ['ncii_takedown_24h', 'ncii_stopncii', 'ncii_do_not_pay', 'evidence_capture_ncii',
      'gac_path', 'helpline_181', 'fir_ladder'],
  },

  wc_csam_report: {
    track: 'women_children', anonymousAllowed: true, sensitive: true,
    slots: ['urls', 'platforms', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'status', to: 'under_process' }],
    clocks: [{ key: 'fir_check', afterDays: 7, condition: 'no_fir',
      actions: [{ do: 'artifact', kind: 'fir_pack' }, { do: 'status', to: 'stalled' }] }],
    guidance: ['csam_do_not_download', 'csam_urls_only', 'fir_ladder'],
  },

  wc_stalking: {
    track: 'women_children', anonymousAllowed: true, sensitive: true,
    slots: ['platforms', 'suspect_handles', 'first_seen_at', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'artifact', kind: 'takedown_letter' },
      { do: 'status', to: 'under_process' }],
    clocks: [{ key: 'platform_ack', afterDays: 1, condition: 'no_platform_ack',
      actions: [{ do: 'email', template: 'nudge' }] },
    { key: 'fir_check', afterDays: 15, condition: 'no_fir',
      actions: [{ do: 'artifact', kind: 'fir_pack' }, { do: 'status', to: 'stalled' }] }],
    guidance: ['evidence_capture_ncii', 'helpline_181', 'fir_ladder', 'gac_path'],
  },

  social_impersonation: {
    track: 'other',
    slots: ['platforms', 'urls', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'artifact', kind: 'takedown_letter' },
      { do: 'suspect_lookup' }, { do: 'status', to: 'under_process' }],
    clocks: [{ key: 'platform_ack', afterDays: 1, condition: 'no_platform_ack',
      actions: [{ do: 'email', template: 'nudge' }] },
    { key: 'gac', afterDays: 15, condition: 'content_not_removed',
      actions: [{ do: 'artifact', kind: 'gac_note' }] },
    { key: 'fir_check', afterDays: 15, condition: 'no_fir',
      actions: [{ do: 'artifact', kind: 'fir_pack' }, { do: 'status', to: 'stalled' }] }],
    guidance: ['impersonation_warn_contacts', 'takedown_24h_impersonation', 'gac_path', 'fir_ladder'],
  },

  account_takeover: {
    track: 'other',
    slots: ['platforms', 'account_id', 'when_lost', 'recovery_tried', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'artifact', kind: 'certin_email' },
      { do: 'status', to: 'under_process' }],
    clocks: [{ key: 'fir_check', afterDays: 15, condition: 'no_fir',
      actions: [{ do: 'artifact', kind: 'fir_pack' }, { do: 'status', to: 'stalled' }] }],
    guidance: ['recovery_checklist', 'credential_rotation', 'certin_what', 'fir_ladder'],
  },

  hacking_ransomware: {
    track: 'other',
    slots: ['system_affected', 'ransom_note', 'when', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'artifact', kind: 'certin_email' },
      { do: 'status', to: 'under_process' }],
    clocks: [{ key: 'fir_check', afterDays: 15, condition: 'no_fir',
      actions: [{ do: 'artifact', kind: 'fir_pack' }, { do: 'status', to: 'stalled' }] }],
    guidance: ['ransom_do_not_pay', 'decryptor_check', 'isolate_machine', 'certin_what', 'fir_ladder'],
  },

  telecom_fraud: {
    track: 'other',
    slots: ['numbers', 'message_samples', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'suspect_lookup' },
      { do: 'status', to: 'under_process' }],
    clocks: [],
    guidance: ['chakshu_how', 'tafcop_how', 'simswap_check'],
  },

  digital_arrest_no_loss: {
    track: 'other',
    slots: ['caller_claims', 'numbers', 'narrative'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'suspect_lookup' },
      { do: 'status', to: 'under_process' }],
    clocks: [],
    guidance: ['digital_arrest_truths', 'chakshu_how'],
  },

  generic_other: {
    track: 'other',
    slots: ['narrative', 'when', 'suspect_contacts'],
    immediate: [{ do: 'artifact', kind: 'complaint_pdf' }, { do: 'status', to: 'under_process' }],
    clocks: [{ key: 'fir_check', afterDays: 15, condition: 'no_fir',
      actions: [{ do: 'artifact', kind: 'fir_pack' }, { do: 'status', to: 'stalled' }] },
    { key: 'status_rti', afterDays: 30, condition: 'always',
      actions: [{ do: 'offer', key: 'status_rti' }] }],
    guidance: ['evidence_basics', 'fir_ladder', 'zero_fir_any_ps'],
  },
};

export const CATEGORY_KEYS = Object.keys(playbooks);

export function getPlaybook(category: string): Playbook | null {
  return playbooks[category] ?? null;
}
