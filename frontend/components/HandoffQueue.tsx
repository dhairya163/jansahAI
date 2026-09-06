'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeTopic } from '@/lib/supabaseClient';
import {
  opsHandoffs, opsHandoff, opsHandoffAccept, opsHandoffMessage, opsHandoffClose,
  fmtCase, type HandoffSummary, type HandoffMsg,
} from '@/lib/api';

function waiting(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Ops console: live handoff queue + chat drawer. */
export function HandoffQueue({ auth }: { auth: string }) {
  const [rows, setRows] = useState<HandoffSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [messages, setMessages] = useState<HandoffMsg[]>([]);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [, tick] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setName(localStorage.getItem('ops-name') ?? 'Priya'); }, []);

  const refresh = useCallback(async () => {
    try { setRows((await opsHandoffs(auth)).handoffs); } catch { /* ignore */ }
  }, [auth]);

  useEffect(() => {
    void refresh();
    const unsub = subscribeTopic('ops:handoffs', () => { void refresh(); });
    const iv = setInterval(() => { void refresh(); tick((t) => t + 1); }, 5000);
    return () => { unsub(); clearInterval(iv); };
  }, [refresh]);

  const loadChat = useCallback(async (id: string) => {
    try { const d = await opsHandoff(auth, id); setMessages(d.messages); } catch { /* ignore */ }
  }, [auth]);

  useEffect(() => {
    if (!open) return;
    void loadChat(open);
    const unsub = subscribeTopic(`handoff:${open}`, (event, payload) => {
      const p = payload as Record<string, unknown>;
      if (event === 'message') setMessages((m) => (m.some((x) => x.id === p.id) ? m : [...m, p as unknown as HandoffMsg]));
      if (event === 'accepted' || event === 'closed') { setMessages((m) => [...m, p.message as HandoffMsg]); void refresh(); }
    });
    return unsub;
  }, [open, loadChat, refresh]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);

  const accept = async (id: string) => {
    const n = name.trim() || 'Jansah desk';
    localStorage.setItem('ops-name', n);
    await opsHandoffAccept(auth, id, n);
    setOpen(id);
    await refresh();
  };
  const send = async () => {
    const t = text.trim(); if (!t || !open) return;
    setText('');
    await opsHandoffMessage(auth, open, t);
  };
  const close = async (id: string) => { await opsHandoffClose(auth, id); if (open === id) setOpen(null); await refresh(); };

  const active = rows.filter((r) => r.status !== 'closed');
  const current = rows.find((r) => r.id === open) ?? null;

  return (
    <div style={{ marginBottom: 'var(--sp-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-3)', gap: 12 }}>
        <span className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em' }}>LIVE HANDOFFS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="faint" style={{ fontSize: 12 }}>You are</span>
          <input className="input" style={{ minHeight: 32, width: 120, fontSize: 13 }} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => localStorage.setItem('ops-name', name)} />
          <span className={`chip ${active.some((r) => r.status === 'queued') ? 'chip-sim' : 'chip-line'}`}>
            {active.some((r) => r.status === 'queued') ? '● ' : ''}{active.filter((r) => r.status === 'queued').length} waiting · {active.filter((r) => r.status === 'accepted').length} live
          </span>
        </div>
      </div>

      {active.length === 0 && <div className="card-tint" style={{ fontSize: 13 }} ><span className="faint">No one is waiting for a person right now. Requests from the call page or a phone call appear here instantly.</span></div>}

      <div className="stack-2">
        {active.map((h) => (
          <div key={h.id} className="card" style={{ borderColor: h.status === 'queued' ? 'var(--gerua-200)' : 'var(--neem-200)', padding: 'var(--sp-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <p style={{ fontSize: 13.5, fontWeight: 500 }}>
                  {h.reporter ?? 'Caller'} · <span className={`chip ${h.channel === 'phone' ? 'chip-warn' : 'chip-line'}`} style={{ fontSize: 11 }}>{h.channel === 'phone' ? '📞 phone' : '🖥 web'}</span>
                  {h.language && <span className="faint"> · {h.language}</span>}
                  {h.category && <span className="faint"> · {h.category}</span>}
                  {h.case_number && <span className="mono faint" style={{ fontSize: 12 }}> · {fmtCase(h.case_number)}</span>}
                  {h.phone_masked && <span className="mono faint" style={{ fontSize: 12 }}> · {h.phone_masked}</span>}
                  <span className="faint"> · waiting {waiting(h.created_at)}</span>
                </p>
                <p style={{ fontSize: 13, marginTop: 6, maxWidth: '70ch' }}><b>Brief:</b> {h.ai_summary ?? '—'}</p>
                {h.reason && <p className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>Asked for: “{h.reason}”</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
                {h.status === 'queued'
                  ? <button className="btn btn-sm btn-primary" style={{ minHeight: 36 }} onClick={() => void accept(h.id)}>{h.channel === 'phone' ? 'Take the call' : 'Accept · chat'}</button>
                  : h.operator_kind === 'ai'
                    ? <button className="btn btn-sm btn-primary" style={{ minHeight: 36 }} title={`${h.assigned_to} (AI desk persona) is on the call — take over as a human`} onClick={() => void accept(h.id)}>Take over from {h.assigned_to} (AI)</button>
                    : <button className="btn btn-sm" onClick={() => setOpen(open === h.id ? null : h.id)}>{open === h.id ? 'Hide chat' : `Chat · ${h.assigned_to}`}</button>}
                <button className="btn btn-sm" style={{ color: 'var(--gerua-800)' }} onClick={() => void close(h.id)}>Close</button>
              </div>
            </div>

            {open === h.id && current && (
              <div style={{ marginTop: 'var(--sp-4)', borderTop: '1px solid var(--line)', paddingTop: 'var(--sp-3)' }}>
                <p className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
                  {h.channel === 'phone' ? 'Phone call — what you type is spoken to the caller by Jansah; their replies appear here as they speak.' : 'Web call — the citizen reads your messages on their screen and types back.'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
                  {messages.map((m) => (
                    <div key={m.id} className={`bubble ${m.sender === 'human' ? 'bubble-u' : m.sender === 'citizen' ? 'bubble-a' : 'bubble-a'}`}
                      style={{ maxWidth: '80%', alignSelf: m.sender === 'system' ? 'center' : m.sender === 'human' ? 'flex-end' : 'flex-start', opacity: m.sender === 'system' ? 0.7 : 1, fontSize: m.sender === 'system' ? 12 : 13.5 }}>
                      {m.sender === 'citizen' && <b>Caller: </b>}{m.sender === 'agent' && <b>Jansah: </b>}{m.text}
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
                {h.status === 'accepted' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input className="input" style={{ minHeight: 40 }} placeholder="Type to the citizen…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} autoFocus />
                    <button className="btn btn-sm btn-primary" style={{ minHeight: 40 }} onClick={() => void send()}>Send</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
