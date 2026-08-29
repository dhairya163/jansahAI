export type CaseStatus = 'draft' | 'registered' | 'under_process' | 'stalled' | 'escalated_l1' | 'escalated_l2' | 'fir_registered' | 'resolved' | 'withdrawn' | 'closed';

export interface CaseRecord {
  id: string; caseNumber: string; track: 'financial' | 'women_children' | 'other'; category: string; status: CaseStatus;
  substatus?: string; language: string; anonymous: boolean; onBehalfOf: boolean; reporterName?: string; victimName?: string;
  phoneMasked?: string; email?: string; aadhaarLast4?: string; amountLost?: number; incidentAt?: string;
  slots: Record<string, unknown>; timeOffsetDays: number; createdAt: string; updatedAt: string;
}

export interface TimelineEvent { id: string; type: string; actor: string; payload: Record<string, unknown>; virtualAt: string; createdAt: string }
export interface Artifact { id: string; kind: string; label: string; createdAt: string }
export interface Guidance { key: string; title: string; body: string }
export interface Clock { id: string; stepKey: string; dueDays: number; status: 'pending' | 'fired' | 'skipped' }
export interface CaseBundle { case: CaseRecord; timeline: TimelineEvent[]; artifacts: Artifact[]; guidance: Guidance[]; clocks: Clock[]; nextClock?: { key: string; label: string; inDaysVirtual: number; dueAt: string }; accessToken?: string }
