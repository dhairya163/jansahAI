export type Track = 'financial' | 'women_children' | 'other';
export type CaseStatus =
  | 'draft'
  | 'registered'
  | 'under_process'
  | 'stalled'
  | 'escalated_l1'
  | 'escalated_l2'
  | 'fir_registered'
  | 'resolved'
  | 'withdrawn'
  | 'closed';

export type Actor = 'citizen' | 'agent' | 'system' | 'ops';
export type ArtifactKind =
  | 'complaint_pdf'
  | 'bank_notice'
  | 'fir_pack'
  | 'sp_letter'
  | 'magistrate_draft'
  | 'takedown_letter'
  | 'certin_email'
  | 'gac_note'
  | 'restoration_request';

export type ClockCondition =
  | 'no_fir'
  | 'no_freeze_confirmation'
  | 'no_platform_ack'
  | 'content_not_removed'
  | 'always';

export type Handler =
  | { do: 'artifact'; kind: ArtifactKind }
  | { do: 'email'; template: 'ack' | 'status' | 'nudge' | 'escalation' | 'restoration' }
  | { do: 'mock_freeze_request' }
  | { do: 'suspect_lookup' }
  | { do: 'ezero_fir_check' }
  | { do: 'offer'; key: string }
  | { do: 'status'; to: CaseStatus };

export interface PlaybookClock {
  key: string;
  afterDays: number;
  condition: ClockCondition;
  actions: Handler[];
}

export interface Playbook {
  track: Track;
  anonymousAllowed?: boolean;
  sensitive?: boolean;
  slots: string[];
  immediate: Handler[];
  clocks: PlaybookClock[];
  guidance: string[];
}

export interface CaseRecord {
  id: string;
  caseNumber: string;
  track: Track;
  category: string;
  status: CaseStatus;
  substatus?: string;
  language: string;
  anonymous: boolean;
  onBehalfOf: boolean;
  reporterName?: string;
  victimName?: string;
  phoneMasked?: string;
  email?: string;
  aadhaarLast4?: string;
  amountLost?: number;
  incidentAt?: string;
  slots: Record<string, unknown>;
  timeOffsetDays: number;
  keepForDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CaseEvent {
  id: string;
  caseId: string;
  type: string;
  actor: Actor;
  payload: Record<string, unknown>;
  virtualAt: string;
  createdAt: string;
}

export interface ArtifactRecord {
  id: string;
  caseId: string;
  kind: ArtifactKind;
  label: string;
  version: number;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface ClockRecord {
  id: string;
  caseId: string;
  stepKey: string;
  dueDays: number;
  condition: ClockCondition;
  actions: Handler[];
  status: 'pending' | 'fired' | 'skipped';
  firedAt?: string;
}

export interface EmailRecord {
  id: string;
  caseId?: string;
  toAddr: string;
  template: string;
  subject: string;
  status: 'queued' | 'sent' | 'skipped' | 'failed';
  payload: Record<string, unknown>;
  sentAt?: string;
  createdAt: string;
}

export interface SuspectRecord {
  id: string;
  caseId?: string;
  kind: 'phone' | 'upi' | 'bank_account' | 'url' | 'email' | 'handle';
  valueNorm: string;
}

export type VoiceLanguage = 'und' | 'en' | 'hi' | 'hi-en';

export interface VoiceSessionMessage {
  role: 'citizen' | 'agent';
  text: string;
  itemId?: string;
  at: string;
}

export interface VoiceToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  at: string;
}

export interface VoiceSessionRecord {
  id: string;
  caseId?: string;
  sessionTokenHash: string;
  startedAt: string;
  endedAt?: string;
  model: string;
  voice: string;
  language: VoiceLanguage;
  minutes?: number;
  status: 'active' | 'completed' | 'abandoned';
  transcript: VoiceSessionMessage[];
  toolCalls: VoiceToolCall[];
  draft: Record<string, unknown>;
  updatedAt: string;
}

export interface CaseBundle {
  case: CaseRecord;
  timeline: CaseEvent[];
  artifacts: ArtifactRecord[];
  clocks: ClockRecord[];
  guidance: Array<{ key: string; title: string; body: string }>;
  nextClock?: { key: string; label: string; inDaysVirtual: number; dueAt: string };
}
