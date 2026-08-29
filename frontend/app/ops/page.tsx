'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { BrandRow } from '@/components/chrome';
import {
  opsFetchCases, opsFetchCase, opsAction, opsUsage, opsTick, opsArtifactUrl,
  fmtCase, fmtINR, type OpsCase, type OpsUsage, type TimelineLine, ApiError,
} from '@/lib/api';

/** §24 /ops — the officials console: THIS is the mocked government/bank side of the demo. */

const STATUS_PILL: Record<string, { bg: string; fg: string }> = {
  registered: { bg: 'var(--paper-2)', fg: 'var(--ink-2)' },
  under_process: { bg: 'var(--neem-100)', fg: 'var(--neem-900)' },
  stalled: { bg: 'var(--haldi-100)', fg: 'var(--haldi-800)' },
  escalated_l1: { bg: 'var(--gerua-100)', fg: 'var(--gerua-800)' },
  escalated_l2: { bg: 'var(--gerua-100)', fg: 'var(--gerua-800)' },
  fir_registered: { bg: 'var(--neem-100)', fg: 'var(--neem-900)' },
  resolved: { bg: 'var(--neem-100)', fg: 'var(--neem-900)' },
  withdrawn: { bg: 'var(--paper-2)', fg: 'var(--ink-2)' },
  closed: { bg: 'var(--paper-2)', fg: 'var(--ink-2)' },
};

interface Drawer {
  id: string;
  timeline: TimelineLine[];
  artifacts: { id: string; kind: string; label_en: string }[];
  clocks: { step_key: string; due_days: number; condition: string; status: string }[];
  slots: Record<string, unknown>;
}

export default function OpsPage() {
  const [auth, setAuth] = useState<string | null>(null);
  const [user, setUser] = useState('ops');
  const [pass, setPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [rows, setRows] = useState<OpsCase[]>([]);
  const [usage, setUsage] = useState<OpsUsage | null>(null);
  const [filter, setFilter] = useState({ status: '', q: '' });
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem('ops-auth');
    if (saved) setAuth(saved);
  }, []);

  const refresh = useCallback(async (a?: string) => {
    const cred = a ?? auth;
    if (!cred) return;
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set('status', filter.status);
      if (filter.q) params.set('q', filter.q);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const [c, u] = await Promise.all([opsFetchCases(cred, qs), opsUsage(cred)]);
      setRows(c.cases); setUsage(u);
      setAuth(cred); sessionStorage.setItem('ops-auth', cred);
      setAuthError('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuth(null); sessionStorage.removeItem('ops-auth');
        setAuthError('Wrong credentials.');
      }
    }
  }, [auth, filter]);

  useEffect(() => { if (auth) void refresh(); }, [auth, filter.status, refresh]);

  const openDrawer = useCallback(async (id: string) => {
    if (!auth) return;
    setOpen(id); setDrawer(null);
    const d = await opsFetchCase(auth, id);
    setDrawer({
      id,
      timeline: d.timeline,
      artifacts: d.artifacts,
      clocks: d.clocks,
      slots: ((d.case as { slots?: Record<string, unknown> }).slots ?? {}),
    });
  }, [auth]);

  const act = useCallback(async (id: string, action: string, body: Record<string, unknown> = {}) => {
    if (!auth) return;
    setBusy(action);
    try {
      await opsAction(auth, id, action, body);
      setFlash(`${action} ✓ — event written to the citizen's timeline`);
      setTimeout(() => setFlash(''), 3500);
      await refresh();
      if (open === id) await openDrawer(id);
    } catch (err) {
      setFlash(`${action} failed: ${(err as Error).message}`);
      setTimeout(() => setFlash(''), 5000);
    } finally { setBusy(null); }
  }, [auth, refresh, open, openDrawer]);

  if (!auth) {
    return (
      <div style={{ background: 'var(--paper-2)', minHeight: '100vh' }}>
        <div className="wrap" style={{ maxWidth: 420, paddingTop: 'var(--sp-11)' }}>
          <BrandRow />
          <div className="card" style={{ marginTop: 'var(--sp-6)', padding: 'var(--sp-6)' }}>
            <p style={{ fontWeight: 500 }}>Officials console</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Basic auth — credentials are in the submission notes / backend .env (OPS_BASIC_AUTH).</p>
            <div className="stack-3" style={{ marginTop: 'var(--sp-4)' }}>
              <input className="input" placeholder="user" value={user} onChange={(e) => setUser(e.target.value)} />
              <input className="input" placeholder="password" type="password" value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void refresh(`${user}:${pass}`); }} />
              <button className="btn btn-primary" onClick={() => void refresh(`${user}:${pass}`)}>Enter</button>
              {authError && <p style={{ color: 'var(--gerua-800)', fontSize: 13 }}>{authError}</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div className="nav">
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>
          <div className="brandrow">
            <BrandRow tagline={false} />
            <span className="chip chip-sim" style={{ marginLeft: 'var(--sp-3)' }}>Officials console · simulated backends</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            {usage && (
              <span className="faint" style={{ fontSize: 13 }}>
                Today: {usage.sessions_today} sessions · {usage.minutes_today} min · ₹{usage.est_cost_inr} est
                {usage.alert && <span style={{ color: 'var(--gerua-800)', fontWeight: 500 }}> · nearing cap</span>}
              </span>
            )}
            <button className="btn btn-sm" disabled={busy === 'tick'}
              onClick={async () => { setBusy('tick'); try { const r = await opsTick(auth); setFlash(`Jobs ran: ${r.evaluated} cases evaluated, ${Object.keys(r.fired).length} fired`); setTimeout(() => setFlash(''), 4000); await refresh(); } finally { setBusy(null); } }}>
              Run jobs
            </button>
          </div>
        </div>
      </div>

      <div className="wrap" style={{ paddingTop: 'var(--sp-6)', paddingBottom: 'var(--sp-9)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          {['', 'registered', 'under_process', 'stalled', 'escalated_l1', 'escalated_l2', 'fir_registered', 'resolved'].map((s2) => (
            <button key={s2} className={`chip ${filter.status === s2 ? 'chip-neem' : 'chip-line'}`}
              onClick={() => setFilter((f) => ({ ...f, status: s2 }))}>{s2 === '' ? 'All' : s2.replace('_', ' ')}</button>
          ))}
          <input className="input" style={{ maxWidth: 220, minHeight: 38, marginLeft: 'auto' }} placeholder="Search case no / category"
            value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') void refresh(); }} />
        </div>

        {flash && <div className="callout-neem" style={{ marginBottom: 'var(--sp-4)', fontSize: 13.5 }}>{flash}</div>}

        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="tbl" style={{ minWidth: 720 }}>
            <thead>
              <tr><th style={{ width: 170 }}>Case</th><th>Category</th><th style={{ width: 130 }}>Status</th><th style={{ width: 100 }}>Amount</th><th style={{ width: 150 }}>Next clock</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pill = STATUS_PILL[r.status] ?? STATUS_PILL.registered;
                return (
                  <Fragment key={r.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => void (open === r.id ? setOpen(null) : openDrawer(r.id))}>
                      <td className="mono" style={{ fontSize: 12.5 }}>{fmtCase(r.case_number)}</td>
                      <td className="muted">{r.category_label.en}{r.anonymous ? ' · anonymous' : ''}{r.keep_for_demo ? ' · seed' : ''}</td>
                      <td><span className="pill" style={{ background: pill.bg, color: pill.fg }}>{r.status_label.en}</span></td>
                      <td>{r.amount_lost !== null ? fmtINR(r.amount_lost) : <span className="faint">—</span>}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{r.next_clock ? `${r.next_clock.step_key} · ${r.next_clock.in_days}d` : <span className="faint">—</span>}</td>
                    </tr>
                    {open === r.id && (
                      <tr>
                        <td colSpan={5} style={{ borderTop: 'none', paddingTop: 0 }}>
                          <div className="card-tint" style={{ padding: 'var(--sp-4)' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
                              <span className="faint" style={{ fontSize: 11.5, marginRight: 4 }}>Actions</span>
                              {r.track === 'financial' && r.amount_held === null && (
                                <button className="chip chip-neem" disabled={!!busy} onClick={(e) => {
                                  e.stopPropagation();
                                  const amt = prompt('Amount held (₹)?', String(Math.round((r.amount_lost ?? 10000) * 0.6)));
                                  if (amt) void act(r.id, 'freeze-confirm', { amount_held: Number(amt) });
                                }}>Confirm freeze</button>
                              )}
                              {['wc_ncii', 'wc_stalking', 'social_impersonation'].includes(r.category) && (
                                <>
                                  <button className="chip chip-line" disabled={!!busy} onClick={(e) => { e.stopPropagation(); void act(r.id, 'platform-ack'); }}>Log platform ack</button>
                                  <button className="chip chip-line" disabled={!!busy} onClick={(e) => { e.stopPropagation(); void act(r.id, 'content-removed'); }}>Content removed</button>
                                </>
                              )}
                              <button className="chip chip-line" disabled={!!busy} onClick={(e) => {
                                e.stopPropagation();
                                const fir = prompt('FIR number?', `FIR-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`);
                                if (fir) void act(r.id, 'mark-fir', { fir_number: fir });
                              }}>Mark FIR</button>
                              {r.amount_held !== null && (
                                <button className="chip chip-line" disabled={!!busy} onClick={(e) => { e.stopPropagation(); void act(r.id, 'restore', { amount: r.amount_held }); }}>Mark restored</button>
                              )}
                              <button className="chip chip-line" disabled={!!busy} onClick={(e) => {
                                e.stopPropagation();
                                const note = prompt('Resolution note?', 'Resolved after FIR and restoration.');
                                if (note !== null) void act(r.id, 'resolve', { note });
                              }}>Resolve</button>
                              <button className="chip chip-line" disabled={!!busy} onClick={(e) => {
                                e.stopPropagation();
                                const note = prompt('Note?');
                                if (note) void act(r.id, 'note', { text: note });
                              }}>Add note</button>
                              <span style={{ flex: 1 }} />
                              <button className="chip chip-sim" disabled={!!busy} onClick={(e) => { e.stopPropagation(); void act(r.id, 'advance-time', { days: 1 }); }}>+1d</button>
                              <button className="chip chip-sim" disabled={!!busy} onClick={(e) => { e.stopPropagation(); void act(r.id, 'advance-time', { days: 7 }); }}>+7d</button>
                              <button className="chip chip-sim" disabled={!!busy} onClick={(e) => { e.stopPropagation(); void act(r.id, 'jump-next-clock'); }}>Jump to next clock</button>
                              <span className="chip chip-warn">day {r.virtual_day}</span>
                            </div>

                            {drawer?.id === r.id ? (
                              <div className="ops-drawer" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--sp-4)' }}>
                                <div>
                                  <p className="faint" style={{ fontSize: 11.5, marginBottom: 6 }}>Timeline (newest first)</p>
                                  <div className="stack-2" style={{ maxHeight: 260, overflow: 'auto' }}>
                                    {drawer.timeline.map((t) => (
                                      <p key={t.id} style={{ fontSize: 12.5 }}>
                                        <span className="faint">{t.when}</span> — {t.en}
                                        <span className="faint"> · {t.actor}</span>
                                      </p>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <p className="faint" style={{ fontSize: 11.5, marginBottom: 6 }}>Slots (read-only)</p>
                                  <pre style={{ fontSize: 11, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, maxHeight: 140, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                                    {JSON.stringify(drawer.slots, null, 1)}
                                  </pre>
                                  <p className="faint" style={{ fontSize: 11.5, margin: '10px 0 6px' }}>Artifacts</p>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {drawer.artifacts.map((a) => (
                                      <a key={a.id} className="dl" href={opsArtifactUrl(a.id)} target="_blank" rel="noreferrer"
                                        onClick={(e) => { e.preventDefault(); void fetch(opsArtifactUrl(a.id), { headers: { Authorization: `Basic ${btoa(auth)}` } }).then(async (res2) => { if (res2.redirected || res2.url) window.open(res2.url, '_blank'); }); }}>
                                        {a.label_en}
                                      </a>
                                    ))}
                                  </div>
                                  <p className="faint" style={{ fontSize: 11.5, margin: '10px 0 6px' }}>Clocks</p>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {drawer.clocks.map((k) => (
                                      <span key={k.step_key} className={`chip ${k.status === 'pending' ? 'chip-line' : k.status === 'fired' ? 'chip-warn' : 'chip-line'}`} style={{ fontSize: 11 }}>
                                        {k.step_key} d{k.due_days} · {k.status}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : <p className="faint" style={{ fontSize: 12 }}>Loading drawer…</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="faint" style={{ textAlign: 'center', padding: 'var(--sp-7)' }}>No cases match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="faint" style={{ fontSize: 12, marginTop: 'var(--sp-4)' }}>
          Every action here writes a timeline event on the citizen&apos;s case page — this console is the mocked government/bank side of the demo.
        </p>
      </div>
      <style>{`@media (min-width: 900px) { .ops-drawer { grid-template-columns: 1.2fr 1fr !important; } }`}</style>
    </div>
  );
}
