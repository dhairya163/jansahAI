'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { fetchCase, demoAction, artifactUrl, fmtCase, fmtINR, API_BASE, type CasePayload } from '@/lib/api';
import { subscribeTopic } from '@/lib/supabaseClient';
import { BrandRow, LoadingLoop } from '@/components/chrome';

/** §12.3 /case/[caseNumber] — stepper · next-step callout · timeline · guidance · live updates · ?demo=1 time machine. */

const STEP_LABELS = ['Registered', 'In process', 'Stalled', 'Escalated', 'Resolved'];

function stepState(status: string): { index: number; attention: boolean; labels: string[] } {
  const labels = [...STEP_LABELS];
  switch (status) {
    case 'registered': return { index: 0, attention: false, labels };
    case 'under_process': return { index: 1, attention: false, labels };
    case 'stalled': return { index: 2, attention: true, labels };
    case 'escalated_l1': case 'escalated_l2': return { index: 3, attention: true, labels };
    case 'fir_registered': labels[3] = 'FIR registered'; return { index: 3, attention: false, labels };
    case 'resolved': return { index: 4, attention: false, labels };
    default: return { index: 0, attention: false, labels };
  }
}

const DOT: Record<string, string> = {
  registered: '✓', status_changed: '✓', artifact_generated: '✉', email_sent: '✉',
  freeze_requested: '₹', freeze_confirmed: '₹', restoration_offered: '₹', restoration_requested: '₹', amount_restored: '₹',
  clock_fired: '◆', clock_skipped: '◇', suspect_match: '!', fir_marked: '✓',
  identity_verified: '✓', identity_skipped_anonymous: '✓', time_advanced: '⏱', note: '✎',
  ezero_fir_notice: '!', offer: '→', platform_ack: '✓', content_removed: '✓', withdrawn: '✕',
};

function CaseInner() {
  const { caseNumber } = useParams<{ caseNumber: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const demo = params.get('demo') === '1';

  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<CasePayload | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'hi'>('en');

  useEffect(() => {
    const t = sessionStorage.getItem(`case-token:${caseNumber}`);
    if (!t) { router.replace(`/track?case=${caseNumber}${demo ? '&demo=1' : ''}`); return; }
    setToken(t);
  }, [caseNumber, router, demo]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const d = await fetchCase(caseNumber, token);
      setData(d);
      if ((d.case.language ?? '').startsWith('hi')) setLang((l) => l);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('token') || msg.includes('verify')) router.replace(`/track?case=${caseNumber}`);
      else setErr(msg);
    }
  }, [caseNumber, token, router]);

  useEffect(() => { void refresh(); }, [refresh]);

  // live: Supabase broadcast + 10s polling fallback (§12.3)
  useEffect(() => {
    if (!data?.case.id) return;
    const unsub = subscribeTopic(`case:${data.case.id}`, () => { void refresh(); });
    const iv = setInterval(() => { void refresh(); }, 10_000);
    return () => { unsub(); clearInterval(iv); };
  }, [data?.case.id, refresh]);

  const runDemo = useCallback(async (action: 'advance' | 'jump' | 'tick', days?: number) => {
    if (!token) return;
    setBusy(action + (days ?? ''));
    try { await demoAction(caseNumber, token, action, days); await refresh(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }, [caseNumber, token, refresh]);

  const requestRestoration = useCallback(async () => {
    if (!token) return;
    setBusy('restore');
    try {
      await fetch(`${API_BASE}/api/cases/${caseNumber}/restoration`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      await refresh();
    } finally { setBusy(null); }
  }, [caseNumber, token, refresh]);

  const step = useMemo(() => stepState(data?.case.status ?? 'registered'), [data?.case.status]);

  if (!data) {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
        <div className="disclaimer">Independent prototype · demo data only</div>
        <div className="wrap" style={{ paddingTop: 'var(--sp-11)', textAlign: 'center' }}>
          {err ? <p style={{ color: 'var(--gerua-800)' }}>{err}</p> : (
            <div style={{ display: 'flex', justifyContent: 'center' }}><LoadingLoop size={40} /></div>
          )}
        </div>
      </div>
    );
  }

  const c = data.case;
  const isTerminal = c.status === 'withdrawn' || c.status === 'closed';
  const stalledCallout = data.artifacts.find((a) => a.kind === 'fir_pack') && (c.status === 'stalled' || c.status === 'escalated_l1' || c.status === 'escalated_l2');
  const spReady = data.artifacts.find((a) => a.kind === 'sp_letter');
  const magReady = data.artifacts.find((a) => a.kind === 'magistrate_draft');

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div className="disclaimer">Independent prototype · demo data only</div>
      <div className="nav">
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="brandrow">
            <Link href="/" style={{ textDecoration: 'none' }}><BrandRow tagline={false} /></Link>
            <div style={{ marginLeft: 8 }}>
              <p className="faint" style={{ fontSize: 11 }}>Case number</p>
              <p className="mono" style={{ fontSize: 17, fontWeight: 500 }}>{fmtCase(c.case_number)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="chip chip-line" onClick={() => setLang((l) => l === 'en' ? 'hi' : 'en')}>{lang === 'en' ? 'हिं' : 'EN'}</button>
            {demo && <span className="chip chip-warn">Day {c.virtual_day} · demo mode</span>}
          </div>
        </div>
      </div>

      <div className="wrap" style={{ paddingTop: 'var(--sp-7)', paddingBottom: 'var(--sp-9)' }}>
        {/* stepper */}
        {!isTerminal ? (
          <>
            <div className="steps" style={{ maxWidth: 760 }}>
              {step.labels.map((_, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  <span className="stepdot" style={
                    i < step.index ? { background: 'var(--neem-700)', color: '#fff' }
                      : i === step.index
                        ? (step.attention
                          ? { background: 'var(--haldi-600)', border: '3px solid var(--haldi-200)' }
                          : { background: 'var(--neem-700)', color: '#fff' })
                        : { border: '2px solid var(--line-2)' }
                  }>{i < step.index || (i === step.index && !step.attention) ? '✓' : ''}</span>
                  {i < step.labels.length - 1 && (
                    <span className="stepbar" style={{
                      background: i < step.index ? 'var(--neem-200)' : i === step.index && step.attention ? 'var(--haldi-200)' : 'var(--line-2)',
                    }} />
                  )}
                </span>
              ))}
            </div>
            <div className="faint" style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 760, fontSize: 11.5, marginTop: 6 }}>
              {step.labels.map((l, i) => (
                <span key={l} style={i === step.index ? { color: step.attention ? 'var(--haldi-800)' : 'var(--neem-900)', fontWeight: 500 } : undefined}>{l}</span>
              ))}
            </div>
          </>
        ) : (
          <div className="callout-warn" style={{ maxWidth: 760 }}>
            <p style={{ fontWeight: 500, color: 'var(--haldi-800)' }}>
              This case is {c.status === 'withdrawn' ? 'withdrawn at your request' : 'closed'}.
            </p>
          </div>
        )}

        <div className="case-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--sp-6)', marginTop: 'var(--sp-6)', alignItems: 'start' }}>
          <div className="stack-4">
            {/* stalled callout */}
            {stalledCallout && (
              <div className="callout-warn" style={{ padding: 'var(--sp-5)' }}>
                <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--haldi-800)' }}>
                  {lang === 'hi' ? 'अभी FIR नहीं — आपका पुलिस आवेदन तैयार है' : 'No FIR yet — your police application is ready'}
                </p>
                <p style={{ fontSize: 13.5, marginTop: 6, color: 'var(--haldi-800)' }}>
                  {lang === 'hi'
                    ? 'बिना FIR के दिन बीत गए — यह आम है, और आपके पास कानूनी रास्ता है। पैक प्रिंट करें, हस्ताक्षर करें, थाने में जमा करें; रसीद रखें।'
                    : `${c.virtual_day} days passed without an FIR — this is common, and you have a legal path. Print, sign, submit the pack; keep the receipt.${!spReady ? ' The SP escalation prepares itself in 14 days.' : ''}`}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'var(--sp-3)' }}>
                  {data.artifacts.filter((a) => ['fir_pack', 'sp_letter', 'magistrate_draft'].includes(a.kind)).map((a) => (
                    <a key={a.id} className="btn btn-sm" style={{ background: 'var(--paper)', display: 'inline-flex' }}
                      href={token ? artifactUrl(a.id, token) : '#'} target="_blank" rel="noreferrer">
                      Download {lang === 'hi' ? a.label_hi : a.label_en}
                    </a>
                  ))}
                </div>
                {magReady && <p className="faint" style={{ fontSize: 12, marginTop: 8, color: 'var(--haldi-800)' }}>The magistrate application is a DRAFT — have a lawyer review it before filing.</p>}
              </div>
            )}

            {/* timeline */}
            <div>
              <p className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Timeline</p>
              <div className="stack-3" style={{ marginTop: 'var(--sp-3)', maxWidth: 640 }}>
                {data.timeline.map((t) => (
                  <div className="tl" key={t.id}>
                    <span className="dot" style={{
                      color: t.type === 'clock_fired' || t.type === 'time_advanced' ? 'var(--haldi-600)'
                        : t.type === 'suspect_match' || t.type === 'ezero_fir_notice' ? 'var(--gerua-600)' : 'var(--neem-700)',
                    }}>{DOT[t.type] ?? '·'}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14 }}>{lang === 'hi' ? t.hi : t.en}</p>
                      <p className="faint" style={{ fontSize: 12 }}>{t.when}{t.actor === 'ops' ? ' · officials console' : ''}</p>
                    </div>
                    {t.artifact_id && token && (
                      <a className="dl" href={artifactUrl(t.artifact_id, token)} target="_blank" rel="noreferrer">PDF</a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* guidance */}
            {data.guidance.length > 0 && (
              <div>
                <p className="muted" style={{ fontSize: 13, fontWeight: 500, marginTop: 'var(--sp-4)' }}>
                  {lang === 'hi' ? 'आगे क्या करें' : 'What to do next'}
                </p>
                <div className="grid2" style={{ marginTop: 'var(--sp-3)' }}>
                  {data.guidance.map((g) => (
                    <div className="card" key={g.key}>
                      <p style={{ fontWeight: 500, fontSize: 14 }}>{lang === 'hi' ? g.hi.title : g.en.title}</p>
                      <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{lang === 'hi' ? g.hi.body : g.en.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="stack-4">
            {/* held amount */}
            {c.amount_held !== null && (
              <div className="callout-neem" style={{ padding: 'var(--sp-5)' }}>
                <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--neem-900)' }}>
                  {fmtINR(c.amount_held)} {lang === 'hi' ? 'प्राप्तकर्ता बैंक में होल्ड पर' : 'held at payee bank'}
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--neem-700)', marginTop: 4 }}>
                  {lang === 'hi' ? 'इस केस नंबर पर धन-वापसी अनुरोध उपलब्ध है।' : 'Restoration request available against this case number.'}
                </p>
                <button className="btn btn-sm" style={{ marginTop: 'var(--sp-3)', background: 'var(--paper)' }}
                  disabled={busy === 'restore'} onClick={() => void requestRestoration()}>
                  {busy === 'restore' ? 'Preparing…' : 'Request restoration'}
                </button>
              </div>
            )}

            {/* next clock */}
            <div className="card">
              <p className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Next clock</p>
              {data.next_clock ? (
                <>
                  <p style={{ fontSize: 15, marginTop: 4 }}>
                    {lang === 'hi' ? data.next_clock.label_hi : data.next_clock.label_en} in <b>{data.next_clock.in_days_virtual} day{data.next_clock.in_days_virtual === 1 ? '' : 's'}</b>
                  </p>
                  <p className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    Due {data.next_clock.due_date} (virtual) · runs automatically if the condition still holds.
                  </p>
                </>
              ) : (
                <p className="faint" style={{ fontSize: 13.5, marginTop: 4 }}>No pending clocks on this case.</p>
              )}
            </div>

            {/* documents */}
            <div className="card">
              <p className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Documents</p>
              <div className="stack-2" style={{ marginTop: 'var(--sp-3)' }}>
                {data.artifacts.map((a) => (
                  <div className="row" key={a.id} style={{ minHeight: 40, border: 'none', padding: '4px 0' }}>
                    <span style={{ fontSize: 13 }}>{lang === 'hi' ? a.label_hi : a.label_en}</span>
                    {token && <a className="dl" href={artifactUrl(a.id, token)} target="_blank" rel="noreferrer">PDF</a>}
                  </div>
                ))}
                {data.artifacts.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Generating…</p>}
              </div>
            </div>

            {/* demo time machine (§12.3 ?demo=1) */}
            {demo && data.demo_mode && !isTerminal && (
              <div style={{ border: '1px dashed var(--gerua-200)', borderRadius: 'var(--r-2)', padding: 'var(--sp-4)' }}>
                <p style={{ fontSize: 12, color: 'var(--gerua-800)', fontWeight: 500 }}>Demo time machine · day {c.virtual_day}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 'var(--sp-2)', flexWrap: 'wrap' }}>
                  <button className="chip chip-line" disabled={!!busy} onClick={() => void runDemo('advance', 1)}>{busy === 'advance1' ? '…' : '+1 day'}</button>
                  <button className="chip chip-line" disabled={!!busy} onClick={() => void runDemo('advance', 7)}>{busy === 'advance7' ? '…' : '+7 days'}</button>
                  <button className="chip chip-line" disabled={!!busy} onClick={() => void runDemo('jump')}>{busy === 'jump' ? '…' : 'Next clock'}</button>
                  <button className="chip chip-line" disabled={!!busy} onClick={() => void runDemo('tick')}>{busy === 'tick' ? '…' : 'Run jobs'}</button>
                </div>
                <p className="faint" style={{ fontSize: 11, marginTop: 6, color: 'var(--gerua-800)' }}>
                  Advances this case&apos;s virtual clock only — every firing is logged in the timeline.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@media (min-width: 900px) { .case-grid { grid-template-columns: 1.4fr 1fr !important; gap: var(--sp-7) !important; } }`}</style>
    </div>
  );
}

export default function CasePage() {
  return <Suspense fallback={null}><CaseInner /></Suspense>;
}
