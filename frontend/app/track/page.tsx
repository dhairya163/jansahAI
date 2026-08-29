'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DisclaimerStrip, Nav } from '@/components/chrome';
import { requestCaseOtp, verifyCaseOtp, fetchDemoCases, ApiError, type DemoCase, fmtCase } from '@/lib/api';

/** §12.3 /track — 14-digit input (4-4-6), OTP modal, simulated-SMS toast, ?demo=1 persona picker. */

function TrackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const demo = params.get('demo') === '1';

  const [caseNumber, setCaseNumber] = useState((params.get('case') ?? '').replace(/\D/g, '').slice(0, 14));
  const [phase, setPhase] = useState<'enter' | 'otp'>('enter');
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demoCases, setDemoCases] = useState<DemoCase[] | null>(null);

  useEffect(() => {
    if (!demo) return;
    fetchDemoCases().then((d) => setDemoCases(d.cases)).catch(() => setDemoCases([]));
  }, [demo]);

  const grouped = `${caseNumber.slice(0, 4)} ${caseNumber.slice(4, 8)} ${caseNumber.slice(8)}`.trim();

  const sendOtp = useCallback(async (num?: string) => {
    const n = num ?? caseNumber;
    if (n.length !== 14) { setError('Enter all 14 digits.'); return; }
    setBusy(true); setError('');
    try {
      const res = await requestCaseOtp(n);
      setPhoneMasked(res.phone_masked);
      setDemoCode(res.demo_code ?? null);
      setPhase('otp');
      setCode('');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404
        ? 'No case found with that number.'
        : (err as Error).message);
    } finally { setBusy(false); }
  }, [caseNumber]);

  const verify = useCallback(async () => {
    if (code.length !== 6) return;
    setBusy(true); setError('');
    try {
      const res = await verifyCaseOtp(caseNumber, code);
      sessionStorage.setItem(`case-token:${caseNumber}`, res.token);
      router.push(`/case/${caseNumber}${demo ? '?demo=1' : ''}`);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'wrong_code' ? 'Wrong code — try again.' : (err as Error).message);
      setBusy(false);
    }
  }, [caseNumber, code, router, demo]);

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <DisclaimerStrip short />
      <Nav />
      <div className="wrap" style={{ maxWidth: 640, paddingTop: 'var(--sp-9)', paddingBottom: 'var(--sp-11)' }}>
        <h1 style={{ fontSize: 32 }}>Track your case</h1>
        <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>Enter the 14-digit case number from your SMS or email.</p>

        <div className="card" style={{ marginTop: 'var(--sp-6)', padding: 'var(--sp-5)' }}>
          <p className="faint" style={{ fontSize: 12 }}>Case number</p>
          <input
            className="input input-mono"
            style={{ border: 'none', padding: 0, marginTop: 8, fontSize: 24, minHeight: 40 }}
            inputMode="numeric"
            placeholder="2026 0829 ______"
            value={grouped}
            onChange={(e) => { setCaseNumber(e.target.value.replace(/\D/g, '').slice(0, 14)); setPhase('enter'); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void sendOtp(); }}
          />
          <div style={{ height: 2, background: caseNumber.length === 14 ? 'var(--neem-600)' : 'var(--line-2)', marginTop: 10, borderRadius: 2, width: `${Math.max(8, (caseNumber.length / 14) * 100)}%`, transition: 'width .2s' }} />
          {phase === 'enter' && (
            <button className="btn btn-primary" style={{ marginTop: 'var(--sp-4)', width: '100%' }}
              disabled={busy || caseNumber.length !== 14} onClick={() => void sendOtp()}>
              {busy ? 'Sending…' : 'Send OTP'}
            </button>
          )}
        </div>

        {phase === 'otp' && (
          <>
            {demoCode && (
              <div className="toast toast-in" style={{ marginTop: 'var(--sp-4)' }}>
                <p className="faint" style={{ fontSize: 11 }}>Messages · now (simulated SMS)</p>
                <p style={{ fontSize: 13, marginTop: 2 }}><span className="mono">{demoCode}</span> is your Jansah.AI status OTP. साझा न करें.</p>
              </div>
            )}
            <div className="card-tint" style={{ marginTop: 'var(--sp-4)', padding: 'var(--sp-5)' }}>
              <p style={{ fontWeight: 500, fontSize: 14.5 }}>Verify it&apos;s you</p>
              <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                OTP sent to <span className="mono">{phoneMasked ?? 'the number on this case'}</span>
                {phoneMasked ? ' — the number registered on this case.' : '.'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--sp-4)', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                <input
                  className="input input-mono"
                  style={{ maxWidth: 220, textAlign: 'center', fontSize: 22 }}
                  inputMode="numeric" maxLength={6} placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Enter') void verify(); }}
                  autoFocus
                />
                <button className="btn btn-primary" style={{ minHeight: 48, flex: 1 }} disabled={busy || code.length !== 6} onClick={() => void verify()}>
                  {busy ? 'Verifying…' : 'Verify'}
                </button>
              </div>
              <p className="faint" style={{ fontSize: 12, marginTop: 'var(--sp-3)' }}>
                3 attempts · the code arrives as a simulated SMS on screen
              </p>
            </div>
          </>
        )}

        {error && <p style={{ color: 'var(--gerua-800)', fontSize: 13.5, marginTop: 'var(--sp-3)' }}>{error}</p>}

        {demo && (
          <div className="sec">
            <p style={{ fontSize: 13, fontWeight: 500 }} className="muted">Demo picker — seeded personas (one click)</p>
            <div className="stack-2" style={{ marginTop: 'var(--sp-3)' }}>
              {demoCases === null && <p className="faint" style={{ fontSize: 13 }}>Loading…</p>}
              {demoCases?.map((d) => (
                <button key={d.case_number} className="row" style={{ width: '100%', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--body)' }}
                  onClick={() => { setCaseNumber(d.case_number); void sendOtp(d.case_number); }}>
                  <span>
                    <span className="mono" style={{ fontSize: 12.5 }}>{fmtCase(d.case_number)}</span>
                    <span className="muted" style={{ marginLeft: 10, fontSize: 12.5 }}>{d.category_label.en}{d.anonymous ? ' · anonymous' : ''}</span>
                  </span>
                  <span className="chip chip-line" style={{ fontSize: 11 }}>day {d.virtual_day} · {d.status_label.en}</span>
                </button>
              ))}
              {demoCases?.length === 0 && <p className="faint" style={{ fontSize: 13 }}>No seeded cases — run the backend seed script.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrackPage() {
  return <Suspense fallback={null}><TrackInner /></Suspense>;
}
