'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, MessageSquareText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, caseTokenKey } from '@/lib/api';
import type { CaseBundle } from '@/lib/types';

const grouped = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return [digits.slice(0, 4), digits.slice(4, 8), digits.slice(8)].filter(Boolean).join(' ');
};

export function TrackClient() {
  const router = useRouter();
  const [caseNumber, setCaseNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'case' | 'otp'>('case');
  const [masked, setMasked] = useState('');
  const [demoCode, setDemoCode] = useState('424242');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demos, setDemos] = useState<CaseBundle[]>([]);

  useEffect(() => { api.demoCases().then((result) => setDemos(result.cases)).catch(() => undefined); }, []);

  async function sendOtp() {
    const value = caseNumber.replace(/\D/g, '');
    if (value.length !== 14) return setError('Enter the full 14-digit case number.');
    setLoading(true); setError('');
    try {
      const response = await api.sendOtp(value);
      setMasked(response.phoneMasked); setDemoCode(response.demoCode ?? ''); setStage('otp');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Case not found.'); }
    finally { setLoading(false); }
  }

  async function verify() {
    const value = caseNumber.replace(/\D/g, '');
    if (otp.length !== 6) return setError('Enter the 6-digit code.');
    setLoading(true); setError('');
    try {
      const response = await api.verifyOtp(value, otp);
      sessionStorage.setItem(caseTokenKey(value), response.token);
      router.push(`/case/${value}?demo=1`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Incorrect code.'); }
    finally { setLoading(false); }
  }

  return <section className="jansah-wrap max-w-[640px]! py-8 sm:py-24">
    <h1 className="text-2xl font-semibold sm:text-[32px]">Track your case</h1>
    <p className="mt-2 text-[13.5px] text-[var(--ink-2)] sm:text-[15px]">Enter the 14-digit case number from your SMS or email.</p>

    <div className="jansah-card mt-5 p-4 sm:mt-6 sm:p-5">
      <label htmlFor="case-number" className="text-[11.5px] text-[var(--ink-3)]">Case number</label>
      <Input id="case-number" value={caseNumber} onChange={(event) => setCaseNumber(grouped(event.target.value))} onKeyDown={(event) => event.key === 'Enter' && stage === 'case' && sendOtp()} inputMode="numeric" placeholder="2026 0829 483920" className="jansah-mono mt-1 h-12 border-0 border-b-2 border-[var(--neem-600)] bg-transparent px-0 text-[19px] shadow-none focus-visible:ring-0 sm:text-2xl" />
    </div>

    {stage === 'case' ? <>
      {error && <p className="mt-3 text-sm text-[var(--gerua-600)]">{error}</p>}
      <Button onClick={sendOtp} disabled={loading} className="mt-4 h-14 w-full rounded-2xl bg-[var(--neem-700)] text-base hover:bg-[var(--neem-600)]">{loading ? <Loader2 className="animate-spin" /> : 'Send OTP'}</Button>
      {demos.length > 0 && <div className="mt-8 border-t border-[var(--line)] pt-5"><p className="text-xs font-medium text-[var(--ink-3)]">Seeded demo cases</p><div className="mt-3 grid gap-2">{demos.slice(0, 3).map((bundle) => <button key={bundle.case.id} onClick={() => setCaseNumber(grouped(bundle.case.caseNumber))} className="jansah-row flex items-center justify-between px-4 py-2 text-left hover:bg-[var(--paper-1)]"><span><span className="block text-[13.5px] font-medium">{bundle.case.reporterName ?? 'Anonymous case'}</span><span className="jansah-mono text-[11.5px] text-[var(--ink-3)]">{grouped(bundle.case.caseNumber)}</span></span><ArrowRight className="size-4 text-[var(--ink-3)]" /></button>)}</div></div>}
    </> : <div className="jansah-card-tint mt-4 p-4 sm:p-5">
      <div className="flex items-start gap-3"><MessageSquareText className="mt-1 size-4 text-[var(--neem-700)]" /><div><h2 className="font-sans text-[14.5px] font-medium">Verify it&apos;s you</h2><p className="mt-0.5 text-[12.5px] text-[var(--ink-2)]">OTP sent to <span className="jansah-mono">{masked}</span> — no real SMS was sent.</p></div></div>
      {demoCode && <div className="mt-4 rounded-2xl border border-[var(--line-2)] bg-white p-3"><p className="text-[11px] text-[var(--ink-3)]">Messages · now (simulated SMS)</p><p className="mt-0.5 text-[13px]"><span className="jansah-mono">{demoCode}</span> is your Jansah.AI status OTP.</p></div>}
      <Input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(event) => event.key === 'Enter' && verify()} inputMode="numeric" aria-label="Six digit OTP" placeholder="••••••" className="jansah-mono mt-4 h-[52px] rounded-xl bg-white text-center text-xl tracking-[.5em]" />
      {error && <p className="mt-3 text-sm text-[var(--gerua-600)]">{error}</p>}
      <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-[var(--ink-3)]">3 attempts · demo code on screen</span><Button onClick={verify} disabled={loading} className="h-12 rounded-xl bg-[var(--neem-700)] px-5 hover:bg-[var(--neem-600)]">{loading ? <Loader2 className="animate-spin" /> : 'Verify'}</Button></div>
      <button onClick={() => { setStage('case'); setError(''); }} className="mt-3 text-xs text-[var(--neem-700)]">Use a different case number</button>
    </div>}
    <p className="mt-8 text-[11.5px] text-[var(--ink-3)]">Lost your case number? It&apos;s in your acknowledgment email.</p>
  </section>;
}
