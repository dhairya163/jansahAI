import type { CaseStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const labels: Record<CaseStatus, string> = { draft: 'Draft', registered: 'Registered', under_process: 'In process', stalled: 'Stalled', escalated_l1: 'Escalated L1', escalated_l2: 'Escalated L2', fir_registered: 'FIR registered', resolved: 'Resolved', withdrawn: 'Withdrawn', closed: 'Closed' };
export function StatusPill({ status }: { status: CaseStatus }) {
  return <span className={cn('inline-flex rounded-full px-[11px] py-[3px] text-[11.5px] font-medium', status === 'resolved' || status === 'fir_registered' || status === 'under_process' ? 'bg-[var(--neem-100)] text-[var(--neem-900)]' : status === 'stalled' ? 'bg-[var(--haldi-100)] text-[var(--haldi-800)]' : status.startsWith('escalated') ? 'bg-[var(--gerua-100)] text-[var(--gerua-800)]' : 'bg-[var(--paper-2)] text-[var(--ink-2)]')}>{labels[status]}</span>;
}
