'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeTopic } from '@/lib/supabaseClient';
import { myHandoff, sendHandoffMessage, closeMyHandoff, type HandoffMsg, type HandoffSummary } from '@/lib/api';

/**
 * Citizen-side handoff chat (call page). Web sessions type here; phone sessions just watch —
 * the operator's words are spoken to them by the agent and mirrored here.
 */
export function HandoffPanel({ token, handoffId, channel, onStatus }: {
  token: string; handoffId: string; channel: 'web' | 'phone';
  onStatus?: (status: 'queued' | 'accepted' | 'closed', name?: string | null) => void;
}) {
  const [summary, setSummary] = useState<HandoffSummary | null>(null);
  const [messages, setMessages] = useState<HandoffMsg[]>([]);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await myHandoff(token);
      if (d.handoff) { setSummary(d.handoff); setMessages(d.messages); onStatus?.(d.handoff.status, d.handoff.assigned_to); }
    } catch { /* keep last state */ }
  }, [token, onStatus]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const unsub = subscribeTopic(`handoff:${handoffId}`, (event, payload) => {
      const p = payload as Record<string, unknown>;
      if (event === 'message') setMessages((m) => (m.some((x) => x.id === p.id) ? m : [...m, p as unknown as HandoffMsg]));
      if (event === 'accepted') { setMessages((m) => [...m, (p.message as HandoffMsg)]); setSummary((s) => (s ? { ...s, status: 'accepted', assigned_to: String(p.name) } : s)); onStatus?.('accepted', String(p.name)); }
      if (event === 'closed') { setMessages((m) => [...m, (p.message as HandoffMsg)]); setSummary((s) => (s ? { ...s, status: 'closed' } : s)); onStatus?.('closed'); }
    });
    const iv = setInterval(() => { void load(); }, 6000);
    return () => { unsub(); clearInterval(iv); };
  }, [handoffId, load, onStatus]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);

  const send = useCallback(async () => {
    const t = text.trim(); if (!t) return;
    setText('');
    try { await sendHandoffMessage(token, handoffId, t); } catch { /* ignore */ }
  }, [text, token, handoffId]);

  const status = summary?.status ?? 'queued';
  const name = summary?.assigned_to ?? null;

  return (
    <div className="card-tint toast-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', minHeight: 0 }}>
      <div className="callout-neem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        <span style={{ fontSize: 13 }}>
          {status === 'queued' && <><b>Connecting you to a person</b> · Jansah desk has your summary{channel === 'web' ? ' · your mic is paused' : ''}</>}
          {status === 'accepted' && <><b>{name} joined</b> · Jansah desk{channel === 'phone' ? ' · replies are spoken to you on the call' : ' · voice paused'}</>}
          {status === 'closed' && <><b>Conversation with the desk ended</b> · Jansah continues</>}
        </span>
        <span className={`chip ${status === 'accepted' ? 'chip-neem' : 'chip-line'}`}>{status === 'queued' ? 'waiting…' : status === 'accepted' ? 'human' : 'closed'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.sender === 'citizen' ? 'bubble-u' : m.sender === 'human' ? 'bubble-h' : 'bubble-a'}`}
            style={{ maxWidth: '85%', alignSelf: m.sender === 'system' ? 'center' : undefined, opacity: m.sender === 'system' ? 0.7 : 1, fontSize: m.sender === 'system' ? 12 : 14 }}>
            {m.sender === 'human' && <b>{m.name ?? name ?? 'Desk'}: </b>}{m.text}
          </div>
        ))}
        {messages.length === 0 && <p className="faint" style={{ fontSize: 13 }}>A person from the desk will pick this up shortly. You can keep talking to Jansah meanwhile.</p>}
        <div ref={endRef} />
      </div>
      {channel === 'web' && status !== 'closed' && (
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <input className="input" style={{ minHeight: 42 }} placeholder={status === 'accepted' ? `Message ${name ?? 'the desk'}…` : 'Type a message for the desk…'}
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} />
          <button className="btn btn-sm" onClick={() => void send()}>Send</button>
          <button className="btn btn-sm" title="End chat" onClick={() => void closeMyHandoff(token, handoffId)}>End</button>
        </div>
      )}
    </div>
  );
}
