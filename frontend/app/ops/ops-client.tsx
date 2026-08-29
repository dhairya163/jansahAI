'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Banknote, CheckCircle2, KeyRound, Loader2, Play, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/status-pill';
import { api } from '@/lib/api';
import type { CaseBundle } from '@/lib/types';
import { cn } from '@/lib/utils';

export function OpsClient() {
  const [credentials, setCredentials] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [cases, setCases] = useState<CaseBundle[]>([]);
  const [usage, setUsage] = useState({ sessionsToday: 0, minutesToday: 0, emailsToday: 0 });
  const [selected, setSelected] = useState<CaseBundle | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionValue, setActionValue] = useState('');

  const filtered = useMemo(() => cases.filter((item) => (status === 'all' || item.case.status === status) && `${item.case.caseNumber} ${item.case.reporterName ?? ''} ${item.case.category}`.toLowerCase().includes(query.toLowerCase())), [cases, query, status]);

  async function login() {
    setLoading(true); setError('');
    try { const result = await api.opsCases(credentials); setCases(result.cases); setUsage(result.usage); setAuthenticated(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not authenticate.'); }
    finally { setLoading(false); }
  }

  async function act(action: string, body: Record<string, unknown>) {
    if (!selected) return;
    setLoading(true); setError('');
    try {
      const updated = await api.opsAction(credentials, selected.case.id, action, body);
      setSelected(updated);
      setCases((current) => current.map((item) => item.case.id === updated.case.id ? updated : item));
      setActionValue('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Action failed.'); }
    finally { setLoading(false); }
  }

  if (!authenticated) return <section className="jansah-wrap grid min-h-[65vh] max-w-lg! place-items-center py-12"><div className="jansah-card w-full p-6">
    <div className="grid size-10 place-items-center rounded-xl bg-[var(--gerua-100)] text-[var(--gerua-800)]"><KeyRound className="size-4" /></div>
    <span className="jansah-chip jansah-chip-sim mt-4">Officials console · simulated backends</span>
    <h1 className="mt-3 text-[30px] font-semibold">Ops console</h1>
    <p className="mt-2 text-[13.5px] leading-6 text-[var(--ink-2)]">This represents bank, police, and platform responses. Every action is visibly labelled and logged.</p>
    <label className="mt-5 block text-[13.5px] font-medium">Basic-auth credentials<Input value={credentials} onChange={(event) => setCredentials(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && login()} placeholder="user:password" className="mt-2 h-12 rounded-xl" /></label>
    <p className="mt-2 text-xs text-[var(--ink-3)]">Local demo default: admin:sahai-demo</p>
    {error && <p className="mt-3 text-sm text-[var(--gerua-600)]">{error}</p>}
    <Button onClick={login} disabled={loading} className="mt-5 h-12 w-full rounded-xl bg-[var(--neem-700)] hover:bg-[var(--neem-600)]">{loading ? <Loader2 className="animate-spin" /> : <>Enter mock ops <ArrowRight /></>}</Button>
  </div></section>;

  return <section className="jansah-wrap py-6 pb-12">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="jansah-chip jansah-chip-sim">Officials console · simulated backends</span>
      <p className="text-[13px] text-[var(--ink-3)]">Today: {usage.sessionsToday} sessions · {usage.minutesToday} min · {usage.emailsToday} emails</p>
    </header>
    {error && <div className="mt-4 rounded-xl border border-[var(--gerua-200)] bg-[var(--gerua-100)] p-3 text-sm text-[var(--gerua-800)]">{error}</div>}

    <div className="mt-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3.5 size-4 text-[var(--ink-3)]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search case, name, or category" className="h-11 rounded-xl bg-white pl-10" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-xl border border-[var(--line-2)] bg-white px-3 text-sm"><option value="all">All statuses</option><option value="under_process">In process</option><option value="stalled">Stalled</option><option value="escalated_l1">Escalated</option><option value="fir_registered">FIR registered</option><option value="resolved">Resolved</option></select></div>

    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="jansah-card overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]"><thead><tr className="text-[11.5px] font-medium text-[var(--ink-3)]"><th className="w-[190px] px-3.5 py-2.5">Case</th><th className="px-3.5 py-2.5">Category</th><th className="w-[130px] px-3.5 py-2.5">Status</th><th className="w-[110px] px-3.5 py-2.5">Amount</th><th className="w-[150px] px-3.5 py-2.5">Next clock</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.case.id} onClick={() => setSelected(item)} className={cn('cursor-pointer border-t border-[var(--line)] hover:bg-[var(--paper-1)]', selected?.case.id === item.case.id && 'bg-[var(--neem-100)]')}><td className="px-3.5 py-3"><p className="jansah-mono text-xs">{item.case.caseNumber}</p><p className="text-[11px] text-[var(--ink-3)]">{item.case.reporterName ?? 'Anonymous'}</p></td><td className="px-3.5 py-3 capitalize text-[var(--ink-2)]">{item.case.category.replaceAll('_', ' ')}</td><td className="px-3.5 py-3"><StatusPill status={item.case.status} /></td><td className="px-3.5 py-3">{item.case.amountLost ? `₹${item.case.amountLost.toLocaleString('en-IN')}` : '—'}</td><td className="px-3.5 py-3 text-[var(--ink-2)]">{item.nextClock ? `${item.nextClock.label.replaceAll('_', ' ')} · ${item.nextClock.inDaysVirtual}d` : '—'}</td></tr>)}</tbody></table></div>
      </div>

      <aside className="jansah-card p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-32px)] xl:overflow-y-auto">{selected ? <>
        <div className="flex items-start justify-between"><div><StatusPill status={selected.case.status} /><h2 className="mt-2 text-xl font-semibold">{selected.case.reporterName ?? 'Anonymous case'}</h2><p className="jansah-mono mt-1 text-[11.5px] text-[var(--ink-3)]">{selected.case.caseNumber}</p></div><button onClick={() => setSelected(null)} className="grid size-9 place-items-center rounded-xl hover:bg-[var(--paper-2)]"><X className="size-4" /></button></div>
        <div className="jansah-card-tint mt-4 grid grid-cols-2 gap-2 p-3">{[['Track', selected.case.track], ['Virtual day', `+${selected.case.timeOffsetDays}`], ['Artifacts', selected.artifacts.length], ['Events', selected.timeline.length]].map(([label, value]) => <div key={label}><p className="text-[10px] text-[var(--ink-3)]">{label}</p><p className="text-[13px] font-medium capitalize">{String(value).replaceAll('_', ' ')}</p></div>)}</div>

        <OpsSection title="Time controls"><div className="grid grid-cols-3 gap-2">{[1, 7, 15].map((days) => <Button key={days} variant="outline" disabled={loading} onClick={() => act('advance-time', { days })} className="h-9 rounded-xl bg-white text-xs">+{days}d</Button>)}</div></OpsSection>
        {selected.case.track === 'financial' && <OpsSection title="Bank simulation"><div className="flex gap-2"><Input value={actionValue} onChange={(event) => setActionValue(event.target.value.replace(/\D/g, ''))} placeholder="Amount held" className="h-10 rounded-xl" /><Button disabled={!actionValue || loading} onClick={() => act('freeze-confirm', { amountHeld: Number(actionValue) })} className="h-10 rounded-xl bg-[var(--neem-700)] px-3 hover:bg-[var(--neem-600)]"><Banknote />Confirm</Button></div></OpsSection>}
        <OpsSection title="Police simulation"><div className="flex gap-2"><Input value={actionValue} onChange={(event) => setActionValue(event.target.value)} placeholder="Mock FIR number" className="h-10 rounded-xl" /><Button disabled={!actionValue || loading} onClick={() => act('mark-fir', { firNumber: actionValue })} className="h-10 rounded-xl px-3"><CheckCircle2 />Mark FIR</Button></div></OpsSection>
        <OpsSection title="Case controls"><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => act('note', { text: 'Platform acknowledgment logged', kind: 'platform_ack' })} className="h-10 rounded-xl text-xs">Platform ack</Button><Button variant="outline" onClick={() => act('note', { text: 'Content removal logged', kind: 'content_removed' })} className="h-10 rounded-xl text-xs">Removed</Button><Button onClick={() => act('resolve', { note: 'Resolved in mock ops' })} className="h-10 rounded-xl bg-[var(--neem-700)] text-xs hover:bg-[var(--neem-600)]">Resolve</Button><Button variant="outline" onClick={() => act('close', { note: 'Closed in mock ops' })} className="h-10 rounded-xl text-xs">Close</Button></div></OpsSection>
        <OpsSection title="Latest events"><div className="space-y-3">{selected.timeline.slice(0, 5).map((event) => <div key={event.id} className="flex gap-2"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--gerua-600)]" /><div><p className="text-[12.5px]">{String(event.payload.label ?? event.type.replaceAll('_', ' '))}</p><p className="text-[10.5px] text-[var(--ink-3)]">{new Date(event.virtualAt).toLocaleString('en-IN')}</p></div></div>)}</div></OpsSection>
      </> : <div className="grid min-h-[360px] place-items-center text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--gerua-100)] text-[var(--gerua-800)]"><Play className="size-4" /></div><h2 className="mt-3 text-lg font-semibold">Select a case</h2><p className="mt-1 max-w-56 text-[12.5px] leading-5 text-[var(--ink-2)]">Simulate bank, police, platform, and time events.</p></div></div>}</aside>
    </div>
    <p className="mt-4 text-xs text-[var(--ink-3)]">Every action writes a timeline event on the citizen&apos;s case page — this is the mocked government/bank side of the demo.</p>
  </section>;
}

function OpsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-4 border-t border-[var(--line)] pt-4"><p className="mb-2 text-[11.5px] font-medium text-[var(--ink-3)]">{title}</p>{children}</div>;
}
