'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Check, CheckCircle2, Copy, Download, FileText, Landmark, Loader2, Mail, RotateCcw, ShieldAlert } from 'lucide-react';

import { Brand } from '@/components/site-header';
import { Button } from '@/components/ui/button';
import { api, caseTokenKey } from '@/lib/api';
import type { CaseBundle, CaseStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const statusSteps = ['Registered', 'In process', 'Stalled', 'Escalated', 'Resolved'];
const rank: Record<CaseStatus, number> = { draft: -1, registered: 0, under_process: 1, stalled: 2, escalated_l1: 3, escalated_l2: 3, fir_registered: 4, resolved: 4, withdrawn: 4, closed: 4 };

export function CaseClient({ caseNumber }: { caseNumber: string }) {
  const search = useSearchParams();
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let access = sessionStorage.getItem(caseTokenKey(caseNumber)) ?? '';
      if (!access) {
        const demos = await api.demoCases();
        const demo = demos.cases.find((item) => item.case.caseNumber === caseNumber);
        if (demo?.accessToken) { access = demo.accessToken; sessionStorage.setItem(caseTokenKey(caseNumber), access); }
      }
      if (!access) throw new Error('This case needs OTP verification before it can be opened.');
      setToken(access); setBundle(await api.getCase(caseNumber, access));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open the case.'); }
    finally { setLoading(false); }
  }, [caseNumber]);

  useEffect(() => { load(); }, [load]);

  async function advance(days: number) {
    if (!bundle) return;
    setAdvancing(true); setError('');
    try { setBundle(await api.advanceDemo(bundle.case.id, days)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not advance demo time.'); }
    finally { setAdvancing(false); }
  }

  if (loading) return <div className="grid min-h-screen place-items-center bg-[var(--paper-1)]"><div className="text-center"><Loader2 className="mx-auto size-6 animate-spin text-[var(--neem-700)]" /><p className="mt-3 text-sm text-[var(--ink-2)]">Opening your secure case timeline…</p></div></div>;
  if (error && !bundle) return <div className="grid min-h-screen place-items-center bg-[var(--paper-1)] px-5"><div className="jansah-card max-w-lg p-7 text-center"><ShieldAlert className="mx-auto text-[var(--gerua-600)]" /><h1 className="mt-4 text-2xl font-semibold">Case access required</h1><p className="mt-2 text-sm text-[var(--ink-2)]">{error}</p><Link href="/track" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-[var(--neem-700)] px-5 text-sm font-medium text-white">Verify with mock OTP</Link></div></div>;
  if (!bundle) return null;

  const record = bundle.case;
  const currentRank = rank[record.status];
  const freezeEvent = bundle.timeline.find((event) => event.type === 'freeze_confirmed');
  const held = typeof freezeEvent?.payload.amountHeld === 'number' ? freezeEvent.payload.amountHeld : null;
  const caseDisplay = record.caseNumber.replace(/(\d{4})(\d{4})(\d{6})/, '$1 $2 $3');

  return <section className="min-h-screen bg-[var(--paper-1)]">
    <nav className="border-b border-[var(--line)] bg-white"><div className="jansah-wrap flex min-h-16 items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-4"><span className="hidden sm:block"><Brand subtitle={false} /></span><button onClick={() => { navigator.clipboard.writeText(record.caseNumber); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }} className="text-left"><span className="block text-[11px] text-[var(--ink-3)]">Case number</span><span className="jansah-mono flex items-center gap-2 text-[15px] font-medium sm:text-[17px]">{caseDisplay}{copied ? <Check className="size-3.5 text-[var(--neem-700)]" /> : <Copy className="size-3.5 text-[var(--ink-3)]" />}</span></button></div>
      <span className="jansah-chip jansah-chip-warn">Day {record.timeOffsetDays} · demo mode</span>
    </div></nav>

    <div className="jansah-wrap py-5 sm:py-8">
      {search.get('new') === '1' && <div className="jansah-callout-neem mb-4 flex items-center gap-3 p-4 text-[13.5px]"><CheckCircle2 className="size-5 shrink-0 text-[var(--neem-700)]" /><span><strong>Complaint registered.</strong> Aapki shikayat darj ho gayi — save this case number. Your PDFs are ready below.</span></div>}
      {error && <div className="mb-4 rounded-2xl border border-[var(--gerua-200)] bg-[var(--gerua-100)] p-3 text-sm text-[var(--gerua-800)]">{error}</div>}

      <div className="max-w-[760px]">
        <div className="flex items-center">{statusSteps.map((label, index) => <div key={label} className={cn('flex items-center', index < statusSteps.length - 1 ? 'flex-1' : '')}><span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10px]', index < currentRank ? 'bg-[var(--neem-700)] text-white' : index === currentRank ? 'border-[3px] border-[var(--haldi-200)] bg-[var(--haldi-600)]' : 'border-2 border-[var(--line-2)]')}>{index < currentRank && <Check className="size-3" />}</span>{index < statusSteps.length - 1 && <span className={cn('h-0.5 flex-1', index < currentRank ? 'bg-[var(--neem-200)]' : index === currentRank ? 'bg-[var(--haldi-200)]' : 'bg-[var(--line-2)]')} />}</div>)}</div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-[var(--ink-3)] sm:text-[11.5px]">{statusSteps.map((label, index) => <span key={label} className={index === currentRank ? 'font-medium text-[var(--haldi-800)]' : ''}>{label}</span>)}</div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-8">
        <div className="space-y-4">
          {currentRank >= 2 && currentRank < 4 && <div className="jansah-callout-warn p-4 sm:p-5"><h1 className="font-sans text-[14px] font-medium sm:text-[15px]">No FIR yet — your police application is ready</h1><p className="mt-1.5 text-[12.5px] leading-5 sm:text-[13.5px]">15 days passed without an FIR. Print, sign, and submit the pack; keep the receipt. The SP escalation prepares itself on time.</p>{bundle.artifacts.find((artifact) => artifact.kind.includes('fir')) && <a href={api.artifactUrl(bundle.artifacts.find((artifact) => artifact.kind.includes('fir'))!.id, token)} className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-[var(--line-2)] bg-white px-4 text-[13px] font-medium">Download FIR pack</a>}</div>}

          <div className="jansah-card p-4 sm:p-5">
            <p className="text-[13px] font-medium text-[var(--ink-2)]">Timeline</p>
            <div className="mt-4 space-y-4">{bundle.timeline.map((event) => {
              const label = String(event.payload.label ?? event.type.replaceAll('_', ' '));
              const Icon = event.type.includes('freeze') ? Landmark : event.type.includes('email') ? Mail : event.type.includes('artifact') ? FileText : Check;
              return <div key={event.id} className="flex items-start gap-3 text-[13px]"><span className={cn('grid size-[26px] shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper-1)] text-[var(--ink-2)]', event.type === 'freeze_confirmed' && 'text-[var(--neem-700)]', event.type === 'clock_fired' && 'text-[var(--haldi-600)]')}><Icon className="size-3.5" /></span><div className="min-w-0 flex-1"><p className="text-[13.5px]">{label}</p><p className="text-[11.5px] text-[var(--ink-3)]">{new Date(event.virtualAt).toLocaleString('en-IN')} · {event.actor}</p></div>{event.payload.simulated === true && <span className="jansah-chip jansah-chip-sim px-2 py-0 text-[10px]">simulated</span>}</div>;
            })}</div>
          </div>
        </div>

        <aside className="space-y-4">
          {held != null && <div className="jansah-callout-neem p-4 sm:p-5"><p className="text-[15px] font-medium">₹{held.toLocaleString('en-IN')} held at payee bank</p><p className="mt-1 text-[12.5px] text-[var(--neem-700)]">Restoration request available against this case number.</p><Button variant="outline" className="mt-3 h-10 rounded-xl bg-white text-[13px]">Request restoration</Button></div>}

          <div className="jansah-card p-4"><p className="text-[13px] font-medium text-[var(--ink-2)]">Next clock</p><p className="mt-1 text-[15px]">{bundle.nextClock ? <>{bundle.nextClock.label.replaceAll('_', ' ')} in <b>{bundle.nextClock.inDaysVirtual} days</b></> : 'No pending automated steps'}</p><p className="mt-0.5 text-xs text-[var(--ink-3)]">Prepared automatically if the case remains unresolved.</p></div>

          <div className="jansah-card p-4"><p className="text-[13px] font-medium text-[var(--ink-2)]">Your documents</p><div className="mt-3 space-y-2">{bundle.artifacts.map((artifact) => <a key={artifact.id} href={api.artifactUrl(artifact.id, token)} className="jansah-row flex items-center gap-3 px-3 py-2"><FileText className="size-4 text-[var(--ink-2)]" /><span className="min-w-0 flex-1 text-[13px] font-medium">{artifact.label}</span><span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--neem-700)]"><Download className="size-3.5" />PDF</span></a>)}</div></div>

          {search.get('demo') === '1' && <div className="rounded-xl border border-dashed border-[var(--gerua-200)] p-4"><p className="flex items-center gap-2 text-xs font-medium text-[var(--gerua-800)]"><RotateCcw className="size-3.5" />Demo time machine</p><div className="mt-2 flex flex-wrap gap-2">{[1, 7, 15].map((days) => <button key={days} disabled={advancing} onClick={() => advance(days)} className="jansah-chip jansah-chip-line">+{days} day{days > 1 ? 's' : ''}</button>)}{bundle.nextClock && <button disabled={advancing} onClick={() => advance(Math.max(1, bundle.nextClock!.inDaysVirtual))} className="jansah-chip jansah-chip-line">Next clock</button>}</div></div>}

          {bundle.guidance.length > 0 && <div className="jansah-card p-4"><p className="text-[13px] font-medium text-[var(--ink-2)]">What to do now</p><div className="mt-3 space-y-3">{bundle.guidance.slice(0, 3).map((item) => <div key={item.key}><h3 className="font-sans text-[13px] font-medium">{item.title}</h3><p className="mt-0.5 text-xs leading-5 text-[var(--ink-2)]">{item.body}</p></div>)}</div></div>}
        </aside>
      </div>
    </div>
  </section>;
}
