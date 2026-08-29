'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { VoiceClient, type CaptionLine, type VoiceState } from '@/lib/voiceClient';
import { fetchCase, artifactUrl, fmtCase, type CasePayload } from '@/lib/api';
import { subscribeTopic } from '@/lib/supabaseClient';
import { MicIcon, BrandRow, JansahMark, LoadingLoop } from '@/components/chrome';

/** §12.2 /call — idle → connecting → live (captions + slot sidebar + phone frame + type-instead) → ended. */

interface Toast { id: number; text: string; pinned?: boolean }
interface SlotView {
  category?: string;
  categoryLabel?: string;
  required: string[];
  slots: Record<string, unknown>;
  identity: 'none' | 'otp_sent' | 'verified' | 'anonymous';
  aadhaarLast4?: string;
  email?: string;
  suspect?: { value: string; matches: number };
  flash: string[];
}

const SLOT_LABELS: Record<string, string> = {
  amount: 'Amount lost', txns: 'Transactions', payee_identifier: 'Payee', own_bank: 'Your bank',
  instrument: 'Method', incident_at: 'When', narrative: 'What happened', platforms: 'Platforms',
  urls: 'Links', suspect_handles: 'Handles', first_seen_at: 'First seen', app_name: 'App',
  platform_name: 'Platform', total_invested: 'Total invested', wallet_addresses: 'Wallets',
  exchange: 'Exchange', account_id: 'Account', when_lost: 'When lost', recovery_tried: 'Recovery tried',
  system_affected: 'System', ransom_note: 'Ransom note', caller_claims: 'Caller claimed',
  numbers: 'Numbers', message_samples: 'Messages', when: 'When', suspect_contacts: 'Suspect contacts',
};

function itemLabel(item: unknown): string {
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const v = o.value ?? o.number ?? o.phone ?? o.upi ?? o.handle ?? o.url ?? o.email ?? o.ref ?? o.id;
    if (v !== undefined && v !== null) return String(v);
    if (o.amount !== undefined) return `₹${Number(o.amount).toLocaleString('en-IN')}`;
    return Object.values(o).map(String).join(' ').slice(0, 24);
  }
  return String(item);
}

function slotDisplay(key: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (key === 'amount' || key === 'total_invested') return `₹${Number(value).toLocaleString('en-IN')}`;
  if (Array.isArray(value)) {
    if (key === 'txns') return `${value.length} added`;
    const parts = value.map(itemLabel);
    const joined = parts.join(', ');
    return parts.length <= 2 && joined.length <= 34 ? joined : `${parts.length} added`;
  }
  if (typeof value === 'object') return itemLabel(value);
  const s = String(value);
  return s.length > 34 ? `${s.slice(0, 32)}…` : s;
}

const TYPE_MODES = [
  { key: 'UPI ID', hint: 'name@bank' },
  { key: 'transaction reference', hint: 'UTR / ref number' },
  { key: 'Aadhaar number (fictional)', hint: '12 digits — use a made-up one' },
  { key: 'OTP', hint: '6-digit code from the on-screen SMS' },
  { key: 'email address', hint: 'you@example.com' },
  { key: 'answer', hint: 'type anything' },
];

export default function CallPage() {
  const [state, setState] = useState<VoiceState>('idle');
  const [errorDetail, setErrorDetail] = useState('');
  const [seconds, setSeconds] = useState(600);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [slotView, setSlotView] = useState<SlotView>({ required: [], slots: {}, identity: 'none', flash: [] });
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeMode, setTypeMode] = useState(TYPE_MODES[0].key);
  const [typeValue, setTypeValue] = useState('');
  const [result, setResult] = useState<{ caseNumber: string; caseToken: string } | null>(null);
  const [endedCase, setEndedCase] = useState<CasePayload | null>(null);

  const clientRef = useRef<VoiceClient | null>(null);
  const captionsScrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);   // stick to bottom unless the user scrolled up to read
  const toastSeq = useRef(0);

  const pushToast = useCallback((text: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id || x.pinned)), 6000 + 2500 * toastSeq.current % 3);
  }, []);

  const onToolResult = useCallback((name: string, res: Record<string, unknown>, isError: boolean, args: Record<string, unknown>) => {
    setActiveTool(null);
    if (isError) return;
    if (res.toast && typeof res.toast === 'object') {
      pushToast(String((res.toast as { text?: string }).text ?? ''));
    }
    if (name === 'classify_category') {
      setSlotView((v) => ({
        ...v,
        category: String(res.category ?? ''),
        categoryLabel: (res.category_label as { en?: string })?.en ?? String(res.category ?? ''),
        required: (res.required_slots as string[]) ?? [],
        identity: res.anonymous_set === true ? 'anonymous' : v.identity,
        flash: ['__category'],
      }));
    }
    if (name === 'set_slots') {
      const patch = (args.patch ?? {}) as Record<string, unknown>;
      setSlotView((v) => ({ ...v, slots: { ...v.slots, ...patch }, flash: (res.saved as string[]) ?? Object.keys(patch) }));
    }
    if (name === 'send_aadhaar_otp') {
      setSlotView((v) => ({ ...v, identity: 'otp_sent', aadhaarLast4: String(args.aadhaar_last4 ?? ''), flash: ['__identity'] }));
      setTypeMode('OTP'); setTypeOpen(true);   // §12.2 type-instead auto-opens on OTP request
    }
    if (name === 'verify_otp' && res.verified === true && res.purpose === 'aadhaar_verify') {
      setSlotView((v) => ({ ...v, identity: 'verified', flash: ['__identity'] }));
      setTypeOpen(false);
    }
    if (name === 'capture_contact') {
      const email = typeof args.email === 'string' ? args.email : undefined;
      if (email) setSlotView((v) => ({ ...v, email, flash: ['__email'] }));
    }
    if (name === 'check_suspect') {
      setSlotView((v) => ({ ...v, suspect: { value: String(args.value ?? ''), matches: Number(res.matches ?? 0) }, flash: ['__suspect'] }));
    }
    if (name === 'register_case' && res.registered === true) {
      setResult({ caseNumber: String(res.case_number), caseToken: String(res.case_token ?? '') });
    }
  }, [pushToast]);

  const start = useCallback(() => {
    setCaptions([]); setResult(null); setEndedCase(null); setErrorDetail('');
    setSlotView({ required: [], slots: {}, identity: 'none', flash: [] });
    const client = new VoiceClient({
      onState: (s, detail) => { setState(s); if (detail) setErrorDetail(detail); },
      onCaption: (line) => setCaptions((prev) => {
        const idx = prev.findIndex((c) => c.id === line.id && c.role === line.role);
        if (idx >= 0) { const next = [...prev]; next[idx] = line; return next; }
        return [...prev, line];
      }),
      onToolCall: (name) => setActiveTool(name),
      onToolResult,
      onTimer: setSeconds,
    });
    clientRef.current = client;
    void client.start();
  }, [onToolResult]);

  const endCall = useCallback(() => { void clientRef.current?.end(); }, []);

  // subscribe to session broadcasts (belt-and-braces alongside tool-result driven UI)
  useEffect(() => {
    const sid = clientRef.current?.sessionId;
    if (state !== 'live' || !sid) return;
    return subscribeTopic(`session:${sid}`, (event, payload) => {
      if (event === 'sms') pushToast(String((payload as { text?: string })?.text ?? ''));
    });
  }, [state, pushToast]);

  // auto-scroll the captions PANE only (never the page), and only when already at the bottom
  useEffect(() => {
    const el = captionsScrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [captions, typeOpen]);

  // layout preview without a voice session: /call?preview=1 (used by QA screenshots)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('preview')) return;
    setState('live');
    setSlotView({
      category: 'financial_upi', categoryLabel: 'UPI fraud',
      required: ['amount', 'incident_at', 'instrument', 'txns', 'payee_identifier', 'own_bank', 'narrative'],
      slots: { amount: 48000, instrument: 'upi', txns: [{ amount: 30000 }, { amount: 18000 }], payee_identifier: 'quickhelp.desk@okpay' },
      identity: 'otp_sent', aadhaarLast4: '7841',
      suspect: { value: 'quickhelp.desk@okpay', matches: 3 }, flash: [],
    });
    const demo: CaptionLine[] = [];
    const lines: [CaptionLine['role'], string][] = [
      ['assistant', 'Namaste, main Jansah hoon — ek independent prototype, sarkari helpline nahin. Boliye, kya hua?'],
      ['user', 'Bhaiya scam ho gaya… parcel wala call aaya, customs bola, maine 48 hazaar bhej diye UPI se. 20 minute pehle.'],
      ['assistant', 'Ravi ji, ghabraaiye mat — 20 minute hi hue hain, paisa rokne ka sabse achha mauka abhi hai. Kitne transactions kiye the?'],
      ['user', 'Do. Ek 30 ka, ek 18 ka.'],
      ['assistant', 'Pehla ₹30,000, doosra ₹18,000 — sahi? Ab jis UPI ID par bheja, spelling ke saath boliye.'],
      ['user', 'quickhelp dot desk at the rate okpay'],
      ['assistant', 'Dohraata hoon: q-u-i-c-k-h-e-l-p, dot, d-e-s-k, at, o-k-p-a-y. Sahi?'],
      ['user', 'Haan bilkul.'],
      ['assistant', 'Ek second… yeh UPI ID hamari records mein pehle bhi 3 baar report ho chuki hai. Aap akele nahin hain, aur yeh complaint mein strong point hai.'],
      ['assistant', 'Ab transaction ka reference number boliye — ya screen par type kar dijiye.'],
      ['user', 'UPI-417238991201'],
      ['assistant', 'Theek hai. Ab identity verify karte hain — demo ke liye koi bhi kalpanik 12-digit Aadhaar number boliye.'],
      ['user', 'Ek do teen chaar, paanch chhe saat aath, sata aath chaar ek.'],
      ['assistant', 'Dohraata hoon digit by digit: 1-2-3-4, 5-6-7-8, 7-8-4-1. Sahi hai?'],
      ['user', 'Haan.'],
      ['assistant', 'OTP aapki screen par SMS mein aaya hai — woh 6 digit boliye.'],
    ];
    lines.forEach(([role, text], i) => demo.push({ id: `pv-${i}`, role, text, final: true }));
    setCaptions(demo);
  }, []);

  // ended: poll the case (artifacts appear as background immediates finish)
  useEffect(() => {
    if (state !== 'ended' || !result?.caseToken) return;
    let stop = false;
    let tries = 0;
    const poll = async () => {
      try {
        const data = await fetchCase(result.caseNumber, result.caseToken);
        if (!stop) setEndedCase(data);
        if (!stop && data.artifacts.length < 1 && tries < 10) { tries += 1; setTimeout(poll, 2000); }
        else if (!stop && tries < 5) { tries += 1; setTimeout(poll, 3000); }
      } catch { if (!stop && tries < 10) { tries += 1; setTimeout(poll, 2500); } }
    };
    void poll();
    return () => { stop = true; };
  }, [state, result]);

  const mmss = useMemo(() => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`, [seconds]);

  const submitTyped = useCallback(() => {
    if (!typeValue.trim()) return;
    clientRef.current?.typeText(typeMode, typeValue.trim());
    setTypeValue('');
    setTypeOpen(false);
  }, [typeMode, typeValue]);

  /* ── idle ── */
  if (state === 'idle') {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
        <div className="disclaimer">Independent hackathon prototype. Not a government service. Use fictional details only.</div>
        <div className="wrap" style={{ maxWidth: 640, paddingTop: 'var(--sp-10)', paddingBottom: 'var(--sp-10)' }}>
          <BrandRow />
          <h1 style={{ fontSize: 32, marginTop: 'var(--sp-6)' }}>Ready to talk?</h1>
          <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>
            Jansah will listen in any language, fill the complaint as you speak, and read every number back.
            Your browser will ask for the microphone — that&apos;s the only thing we need.
          </p>
          <div className="card-tint" style={{ marginTop: 'var(--sp-5)', fontSize: 13.5 }}>
            <p style={{ fontWeight: 500 }}>Demo rules</p>
            <p className="muted" style={{ marginTop: 4 }}>
              Use fictional details — a made-up Aadhaar, made-up references. The OTP arrives as a simulated SMS on screen.
              Sessions are capped at 10 minutes; transcripts are redacted and purged.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-4)', marginTop: 'var(--sp-6)', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ padding: '0 var(--sp-8)' }} onClick={start}>
              <MicIcon /> Start the call
            </button>
            <Link className="btn" style={{ minHeight: 56 }} href="/track">Track a case instead</Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── connecting / error ── */
  if (state === 'connecting' || state === 'error') {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
        <div className="disclaimer">Independent prototype · demo data only</div>
        <div className="wrap" style={{ maxWidth: 560, paddingTop: 'var(--sp-11)', textAlign: 'center' }}>
          {state === 'connecting' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center' }}><LoadingLoop size={44} /></div>
              <p className="muted" style={{ marginTop: 'var(--sp-4)' }}>Connecting to the voice line…</p>
              <button className="btn btn-sm" style={{ marginTop: 'var(--sp-6)' }} onClick={endCall}>Cancel</button>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 28 }}>{errorDetail === 'mic-denied' ? 'Microphone blocked' : 'Could not connect'}</h1>
              <p className="muted" style={{ marginTop: 'var(--sp-3)' }}>
                {errorDetail === 'mic-denied'
                  ? 'Allow microphone access in your browser (padlock icon → Site settings → Microphone), then try again. Or track an existing case without voice.'
                  : `Something went wrong: ${errorDetail || 'unknown error'}. You can retry, or use Track instead.`}
              </p>
              <div style={{ display: 'flex', gap: 'var(--sp-4)', justifyContent: 'center', marginTop: 'var(--sp-6)' }}>
                <button className="btn btn-primary" onClick={start}>Try again</button>
                <Link className="btn" href="/track">Track my case</Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── ended ── */
  if (state === 'ended') {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
        <div className="disclaimer">Independent prototype · demo data only</div>
        <div className="wrap" style={{ maxWidth: 720, paddingTop: 'var(--sp-10)', paddingBottom: 'var(--sp-10)', textAlign: 'center' }}>
          {result ? (
            <>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--neem-100)', color: 'var(--neem-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                <svg className="ic" style={{ width: 30, height: 30 }} viewBox="0 0 24 24"><path d="m4 12 5 5L20 6" /></svg>
              </div>
              <h1 style={{ fontSize: 34, marginTop: 'var(--sp-5)' }}>Complaint registered</h1>
              <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>Aapki shikayat darj ho gayi — save this case number.</p>
              <div className="card" style={{ marginTop: 'var(--sp-6)', padding: 'var(--sp-6)' }}>
                <p className="faint" style={{ fontSize: 12 }}>Case number · केस नंबर</p>
                <p className="mono" style={{ fontSize: 'clamp(24px, 5vw, 34px)', fontWeight: 500, marginTop: 6 }}>{fmtCase(result.caseNumber)}</p>
                <button className="btn btn-sm" style={{ marginTop: 'var(--sp-3)' }}
                  onClick={() => { void navigator.clipboard.writeText(result.caseNumber); }}>Copy number</button>
              </div>
              <div className="grid2" style={{ marginTop: 'var(--sp-4)', textAlign: 'left' }}>
                {(endedCase?.artifacts ?? []).map((a) => (
                  <div key={a.id} className="row" style={{ minHeight: 56 }}>
                    <span>{a.label_en}</span>
                    <a className="dl" href={artifactUrl(a.id, result.caseToken)} target="_blank" rel="noreferrer">Download</a>
                  </div>
                ))}
                {(endedCase?.artifacts ?? []).length === 0 && (
                  <div className="row" style={{ minHeight: 56 }}>
                    <span className="faint">Documents are being generated…</span>
                    <LoadingLoop size={20} />
                  </div>
                )}
              </div>
              <div className="callout-neem" style={{ marginTop: 'var(--sp-4)', fontSize: 14, color: 'var(--neem-900)' }}>
                {endedCase?.case.email_on_file ? 'Copy emailed with attachments · ' : ''}
                {slotView.category?.startsWith('financial') ? 'freeze request sent (simulated) · ' : ''}
                if no FIR by day 15, your police pack arrives ready to sign.
              </div>
              <Link className="btn" style={{ marginTop: 'var(--sp-6)', display: 'inline-flex' }} href={`/track?case=${result.caseNumber}`}>View case status</Link>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 30 }}>Call ended</h1>
              <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>No complaint was registered in this call.</p>
              <div style={{ display: 'flex', gap: 'var(--sp-4)', justifyContent: 'center', marginTop: 'var(--sp-6)' }}>
                <button className="btn btn-primary" onClick={start}><MicIcon /> Call again</button>
                <Link className="btn" href="/">Home</Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── live ── */
  const sidebarRows: { key: string; label: string; value: string; filled: boolean; suspect?: boolean }[] =
    (slotView.required.length > 0 ? slotView.required : Object.keys(slotView.slots)).map((k) => ({
      key: k,
      label: SLOT_LABELS[k] ?? k,
      value: slotDisplay(k, slotView.slots[k]),
      filled: slotView.slots[k] !== undefined && slotView.slots[k] !== null,
      suspect: k === 'payee_identifier' && !!slotView.suspect && slotView.suspect.matches > 0,
    }));

  return (
    <div style={{ background: 'var(--paper)', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="nav" style={{ flex: 'none' }}>
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="brandrow">
            <JansahMark size={32} />
            <span className="wordmark">Jansah<span>.AI</span></span>
            <span className="chip chip-warn" style={{ marginLeft: 'var(--sp-3)' }}>Prototype</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <span className="muted" style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg className="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              {mmss} left
            </span>
            <button className="btn btn-sm" style={{ color: 'var(--gerua-800)' }} onClick={endCall}>End call</button>
          </div>
        </div>
      </div>

      <div className="wrap call-grid" style={{ flex: 1, minHeight: 0, paddingTop: 'var(--sp-5)', paddingBottom: 'var(--sp-5)', display: 'grid', gap: 'var(--sp-5)', gridTemplateColumns: '1fr', gridTemplateRows: 'minmax(0, 1fr) auto', width: '100%' }}>
        {/* captions column — the only thing that scrolls */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)' }}>
            <span className="pulse" style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--neem-600)' }} />
            <span className="muted" style={{ fontSize: 14 }}>
              {activeTool ? `Working… (${activeTool})` : 'Listening — speak in any language · किसी भी भाषा में'}
            </span>
            <button className="chip chip-line" style={{ marginLeft: 'auto' }} onClick={() => setTypeOpen((o) => !o)}>
              ⌨ Type instead
            </button>
          </div>

          {typeOpen && (
            <div className="card-tint toast-in" style={{ flex: 'none', marginBottom: 'var(--sp-3)' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
                {TYPE_MODES.map((m) => (
                  <button key={m.key} className={`chip ${typeMode === m.key ? 'chip-neem' : 'chip-line'}`}
                    onClick={() => setTypeMode(m.key)}>{m.key}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                <input className="input" placeholder={TYPE_MODES.find((m) => m.key === typeMode)?.hint}
                  value={typeValue} onChange={(e) => setTypeValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitTyped(); }} autoFocus />
                <button className="btn" onClick={submitTyped}>Send</button>
              </div>
              <p className="faint" style={{ fontSize: 11.5, marginTop: 'var(--sp-2)' }}>
                Typed values go to the agent exactly like speech — useful for long IDs and the OTP.
              </p>
            </div>
          )}

          <div
            ref={captionsScrollRef}
            aria-live="polite"
            onScroll={(e) => {
              const el = e.currentTarget;
              nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
            style={{
              flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
              display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)',
              paddingRight: 6, paddingBottom: 'var(--sp-2)', scrollBehavior: 'smooth',
            }}>
            {captions.map((c2) => (
              <div key={`${c2.role}-${c2.id}`} className={`bubble ${c2.role === 'assistant' ? 'bubble-a' : 'bubble-u'}`}
                style={{ opacity: c2.final ? 1 : 0.75, maxWidth: '78%', flex: 'none' }}>
                {c2.text}
              </div>
            ))}
            {captions.length === 0 && (
              <p className="faint" style={{ fontSize: 13.5 }}>Say hello — Jansah will greet you and ask what happened.</p>
            )}
          </div>
        </div>

        {/* sidebar column — its own scroll region (bottom sheet on mobile, §12.2) */}
        <div className="call-sidebar" style={{ minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {/* phone frame — mock SMS toasts (§12.2) */}
          <div style={{ minHeight: toasts.length > 0 ? undefined : 0 }}>
            {toasts.map((t) => (
              <div key={t.id} className="toast toast-in" style={{ marginBottom: 'var(--sp-3)' }}
                onClick={() => setToasts((all) => all.map((x) => x.id === t.id ? { ...x, pinned: !x.pinned } : x))}>
                <p className="faint" style={{ fontSize: 11 }}>Messages · now (simulated SMS)</p>
                <p style={{ fontSize: 13, marginTop: 2 }}>{t.text}</p>
              </div>
            ))}
          </div>

          <div className="card-tint" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
              <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Your complaint</span>
              {slotView.categoryLabel
                ? <span className={`chip chip-neem ${slotView.flash.includes('__category') ? 'flash' : ''}`}>{slotView.categoryLabel}</span>
                : <span className="chip chip-line">listening…</span>}
            </div>
            <div className="stack-2">
              {sidebarRows.map((r) => (
                <div key={r.key} className={`row ${slotView.flash.includes(r.key) ? 'flash' : ''}`}
                  style={{
                    borderColor: r.suspect ? 'var(--gerua-200)' : undefined,
                    borderStyle: r.filled ? 'solid' : 'dashed',
                  }}>
                  <span className={r.filled ? 'muted' : 'faint'}>{r.label}</span>
                  {r.suspect ? (
                    <span style={{ color: 'var(--gerua-800)', fontSize: 12.5 }}>
                      {r.value} · {slotView.suspect?.matches} reports
                    </span>
                  ) : (
                    <span className={r.filled ? '' : 'faint'} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                      {r.value}{' '}
                      {r.filled && <svg className="ic" style={{ color: 'var(--neem-700)', width: 14, height: 14 }} viewBox="0 0 24 24"><path d="m4 12 5 5L20 6" /></svg>}
                    </span>
                  )}
                </div>
              ))}
              <div className={`row ${slotView.flash.includes('__identity') ? 'flash' : ''}`}
                style={{ borderStyle: slotView.identity === 'none' ? 'dashed' : 'solid' }}>
                <span className="muted">Identity</span>
                <span className={slotView.identity === 'none' ? 'faint' : ''} style={{ fontSize: 13 }}>
                  {slotView.identity === 'anonymous' && 'Anonymous ✓ (by design)'}
                  {slotView.identity === 'verified' && `Aadhaar ••${slotView.aadhaarLast4} ✓`}
                  {slotView.identity === 'otp_sent' && `Aadhaar ••${slotView.aadhaarLast4} · verifying…`}
                  {slotView.identity === 'none' && '—'}
                </span>
              </div>
              <div className={`row ${slotView.flash.includes('__email') ? 'flash' : ''}`}
                style={{ borderStyle: slotView.email ? 'solid' : 'dashed' }}>
                <span className="faint">Email (optional)</span>
                <span className={slotView.email ? '' : 'faint'} style={{ fontSize: 13 }}>{slotView.email ?? '—'}</span>
              </div>
            </div>
            <p className="faint" style={{ fontSize: 11.5, marginTop: 'var(--sp-3)' }}>
              Fields update live as you speak. Numbers are always read back before saving.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .call-sidebar { max-height: 38dvh; }
        @media (min-width: 900px) {
          .call-grid { grid-template-columns: 1.5fr 1fr !important; grid-template-rows: minmax(0, 1fr) !important; gap: var(--sp-7) !important; }
          .call-sidebar { max-height: none; }
        }
      `}</style>
    </div>
  );
}
