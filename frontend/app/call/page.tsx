'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { VoiceClient, type CaptionLine, type VoiceState } from '@/lib/voiceClient';
import { fetchCase, artifactUrl, fmtCase, callMe, phoneInfo, phoneSession, requestHandoffApi, type CasePayload } from '@/lib/api';
import { subscribeTopic } from '@/lib/supabaseClient';
import { MicIcon, BrandRow, JansahMark, LoadingLoop } from '@/components/chrome';
import { HandoffPanel } from '@/components/HandoffPanel';

/**
 * /call — two ways in, one agent:
 *   web   : browser ↔ OpenAI Realtime over WebRTC (this page relays the tool calls)
 *   phone : "Call me" → Twilio rings the citizen → OpenAI SIP → backend runner (captions stream here)
 * Plus: human handoff panel, scam-radar pattern row, and ?preview= variants for screenshots.
 */

type Mode = 'idle' | 'web' | 'phone';
interface Toast { id: number; text: string; pinned?: boolean }
interface SlotView {
  category?: string; categoryLabel?: string; required: string[]; slots: Record<string, unknown>;
  identity: 'none' | 'otp_sent' | 'verified' | 'anonymous'; aadhaarLast4?: string; email?: string;
  suspect?: { value: string; matches: number }; flash: string[];
}
interface PatternHit { pattern_title: string; count_30d: number; top_regions: { region: string; count: number }[] }
interface HandoffState { id: string; status: 'queued' | 'accepted' | 'closed'; name?: string | null }

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
    const parts = value.map(itemLabel); const joined = parts.join(', ');
    return parts.length <= 2 && joined.length <= 34 ? joined : `${parts.length} added`;
  }
  if (typeof value === 'object') return itemLabel(value);
  const s = String(value);
  return s.length > 34 ? `${s.slice(0, 32)}…` : s;
}

const TYPE_MODES = [
  { key: 'UPI ID', hint: 'name@bank' }, { key: 'transaction reference', hint: 'UTR / ref number' },
  { key: 'Aadhaar number', hint: '12 digits' }, { key: 'OTP', hint: '6-digit code from the SMS' },
  { key: 'email address', hint: 'you@example.com' }, { key: 'answer', hint: 'type anything' },
];

const EMPTY_SLOTS: SlotView = { required: [], slots: {}, identity: 'none', flash: [] };

export default function CallPage() {
  const [mode, setMode] = useState<Mode>('idle');
  const [state, setState] = useState<VoiceState>('idle');
  const [errorDetail, setErrorDetail] = useState('');
  const [seconds, setSeconds] = useState(600);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [slotView, setSlotView] = useState<SlotView>(EMPTY_SLOTS);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typeMode, setTypeMode] = useState(TYPE_MODES[0].key);
  const [typeValue, setTypeValue] = useState('');
  const [result, setResult] = useState<{ caseNumber: string; caseToken: string } | null>(null);
  const [endedCase, setEndedCase] = useState<CasePayload | null>(null);
  const [pattern, setPattern] = useState<PatternHit | null>(null);
  const [handoff, setHandoff] = useState<HandoffState | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // phone mode
  const [phoneAvail, setPhoneAvail] = useState<{ available: boolean; number: string | null; reason: string | null } | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneStatus, setPhoneStatus] = useState<string>('requested');
  const [phoneMasked, setPhoneMasked] = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const clientRef = useRef<VoiceClient | null>(null);
  const captionsScrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const toastSeq = useRef(0);

  const pushToast = useCallback((text: string) => {
    if (!text) return;
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id || x.pinned)), 7000);
  }, []);

  const upsertCaption = useCallback((line: CaptionLine) => setCaptions((prev) => {
    const idx = prev.findIndex((c) => c.id === line.id && c.role === line.role);
    if (idx >= 0) { const next = [...prev]; next[idx] = line; return next; }
    return [...prev, line];
  }), []);

  /** Apply a server broadcast (session:{id}) — the phone path's only UI feed; web uses it for extras. */
  const applyBroadcast = useCallback((event: string, payload: unknown) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    switch (event) {
      case 'caption': upsertCaption({ id: String(p.id), role: p.role === 'user' ? 'user' : 'assistant', text: String(p.text ?? ''), final: true }); break;
      case 'sms': pushToast(String(p.text ?? '')); break;
      case 'tool': setActiveTool(String(p.name ?? '')); setTimeout(() => setActiveTool(null), 1500); break;
      case 'slots_updated': {
        const label = (p.category_label as { en?: string })?.en;
        setSlotView((v) => ({
          ...v,
          category: String(p.category ?? v.category ?? ''), categoryLabel: p.category === 'unclassified' ? v.categoryLabel : (label ?? v.categoryLabel),
          required: (p.required as string[]) ?? v.required, slots: (p.slots as Record<string, unknown>) ?? v.slots,
          aadhaarLast4: (p.aadhaar_last4 as string) ?? v.aadhaarLast4, email: (p.email as string) ?? v.email,
          identity: p.anonymous ? 'anonymous' : p.identity_verified ? 'verified' : p.aadhaar_last4 ? (v.identity === 'verified' ? 'verified' : 'otp_sent') : v.identity,
          flash: (p.flash as string[]) ?? [],
        }));
        break;
      }
      case 'suspect_checked': setSlotView((v) => ({ ...v, suspect: { value: String(p.value ?? ''), matches: Number(p.matches ?? 0) }, flash: ['__suspect'] })); break;
      case 'pattern': if (Number(p.count_30d ?? 0) > 0) setPattern({ pattern_title: String(p.pattern_title ?? ''), count_30d: Number(p.count_30d), top_regions: (p.top_regions as PatternHit['top_regions']) ?? [] }); break;
      case 'registered': setResult({ caseNumber: String(p.case_number), caseToken: String(p.case_token ?? '') }); break;
      case 'call_status': setPhoneStatus(String(p.status ?? '')); break;
      case 'handoff': setHandoff({ id: String(p.id), status: p.status as HandoffState['status'], name: (p.name as string) ?? null }); break;
      default: break;
    }
  }, [pushToast, upsertCaption]);

  // ── web tool results → UI (same as before, plus pattern + handoff) ──
  const onToolResult = useCallback((name: string, res: Record<string, unknown>, isError: boolean, args: Record<string, unknown>) => {
    setActiveTool(null);
    if (isError) return;
    if (res.toast && typeof res.toast === 'object') pushToast(String((res.toast as { text?: string }).text ?? ''));
    if (name === 'classify_category') setSlotView((v) => ({
      ...v, category: String(res.category ?? ''), categoryLabel: (res.category_label as { en?: string })?.en ?? String(res.category ?? ''),
      required: (res.required_slots as string[]) ?? [], identity: res.anonymous_set === true ? 'anonymous' : v.identity, flash: ['__category'],
    }));
    if (name === 'set_slots') { const patch = (args.patch ?? {}) as Record<string, unknown>; setSlotView((v) => ({ ...v, slots: { ...v.slots, ...patch }, flash: (res.saved as string[]) ?? Object.keys(patch) })); }
    if (name === 'send_aadhaar_otp') { setSlotView((v) => ({ ...v, identity: 'otp_sent', aadhaarLast4: String(args.aadhaar_last4 ?? ''), flash: ['__identity'] })); setTypeMode('OTP'); setTypeOpen(true); }
    if (name === 'verify_otp' && res.verified === true && res.purpose === 'aadhaar_verify') { setSlotView((v) => ({ ...v, identity: 'verified', flash: ['__identity'] })); setTypeOpen(false); }
    if (name === 'capture_contact') { const email = typeof args.email === 'string' ? args.email : undefined; if (email) setSlotView((v) => ({ ...v, email, flash: ['__email'] })); }
    if (name === 'check_suspect') setSlotView((v) => ({ ...v, suspect: { value: String(args.value ?? ''), matches: Number(res.matches ?? 0) }, flash: ['__suspect'] }));
    if (name === 'find_similar_cases' && Number(res.count_30d ?? 0) > 0) setPattern({ pattern_title: String(res.pattern_title ?? ''), count_30d: Number(res.count_30d), top_regions: (res.top_regions as PatternHit['top_regions']) ?? [] });
    if (name === 'request_human' && res.handoff_id) setHandoff({ id: String(res.handoff_id), status: 'queued' });
    if (name === 'register_case' && res.registered === true) setResult({ caseNumber: String(res.case_number), caseToken: String(res.case_token ?? '') });
  }, [pushToast]);

  const resetAll = () => {
    setCaptions([]); setResult(null); setEndedCase(null); setErrorDetail(''); setPattern(null); setHandoff(null);
    setSlotView(EMPTY_SLOTS); setToasts([]); setSessionToken(null); setSessionId(null);
  };

  const startWeb = useCallback(() => {
    resetAll(); setMode('web');
    const client = new VoiceClient({
      onState: (s, detail) => { setState(s); if (detail) setErrorDetail(detail); if (s === 'live') { setSessionToken(client.sessionToken); setSessionId(client.sessionId); } },
      onCaption: upsertCaption, onToolCall: (name) => setActiveTool(name), onToolResult, onTimer: setSeconds,
    });
    clientRef.current = client;
    void client.start();
  }, [onToolResult, upsertCaption]);

  const endCall = useCallback(() => { void clientRef.current?.end(); }, []);

  // ── phone mode ──
  useEffect(() => { phoneInfo().then(setPhoneAvail).catch(() => setPhoneAvail({ available: false, number: null, reason: 'backend unreachable' })); }, []);

  const startPhone = useCallback(async () => {
    setPhoneErr(''); setPhoneBusy(true);
    try {
      const r = await callMe(phoneInput);
      resetAll(); setMode('phone'); setPhoneStatus(r.status); setPhoneMasked(r.phone_masked);
      setSessionToken(r.session_token); setSessionId(r.session_id);
    } catch (e) { setPhoneErr((e as Error).message); }
    finally { setPhoneBusy(false); }
  }, [phoneInput]);

  // session broadcasts (phone: everything; web: sms/pattern/handoff extras)
  useEffect(() => {
    if (!sessionId || preview) return;
    return subscribeTopic(`session:${sessionId}`, (event, payload) => {
      if (mode === 'web' && (event === 'caption' || event === 'slots_updated' || event === 'registered' || event === 'call_status')) return;
      applyBroadcast(event, payload);
    });
  }, [sessionId, mode, applyBroadcast, preview]);

  // phone: poll as a fallback for status / case / handoff
  useEffect(() => {
    if (mode !== 'phone' || !sessionToken || preview) return;
    let stop = false;
    const poll = async () => {
      try {
        const s = await phoneSession(sessionToken);
        if (stop) return;
        if (s.status) setPhoneStatus(s.status);
        if (s.case_number && s.case_token) setResult((r) => r ?? { caseNumber: s.case_number!, caseToken: s.case_token! });
        if (s.handoff) setHandoff((h) => (h && h.id === s.handoff!.id ? h : { id: s.handoff!.id, status: s.handoff!.status as HandoffState['status'], name: s.handoff!.assigned_to }));
      } catch { /* keep */ }
      if (!stop) setTimeout(poll, 4000);
    };
    void poll();
    return () => { stop = true; };
  }, [mode, sessionToken, preview]);

  // captions pane auto-scroll (pane only, never the page)
  useEffect(() => { const el = captionsScrollRef.current; if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight; }, [captions, typeOpen, handoff]);

  // handoff → mute mic on web while a human is chatting
  useEffect(() => {
    if (mode !== 'web') return;
    clientRef.current?.setMuted(handoff?.status === 'accepted');
    if (handoff?.status === 'closed') clientRef.current?.typeText('note', 'The desk operator has left the chat; please continue helping me.');
  }, [handoff?.status, mode]);

  // ended: fetch artifacts as the background immediates finish
  const ended = (mode === 'web' && state === 'ended') || (mode === 'phone' && ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(phoneStatus));
  useEffect(() => {
    if (!ended || !result?.caseToken) return;
    let stop = false; let tries = 0;
    const poll = async () => {
      try { const d = await fetchCase(result.caseNumber, result.caseToken); if (!stop) setEndedCase(d); if (!stop && d.artifacts.length < 2 && tries < 12) { tries += 1; setTimeout(poll, 2500); } }
      catch { if (!stop && tries < 12) { tries += 1; setTimeout(poll, 2500); } }
    };
    void poll();
    return () => { stop = true; };
  }, [ended, result]);

  const askHuman = useCallback(async () => {
    if (!sessionToken) return;
    try { const r = await requestHandoffApi(sessionToken, 'asked from the screen'); setHandoff({ id: r.id, status: r.status as HandoffState['status'] }); }
    catch (e) { setErrorDetail((e as Error).message); }
  }, [sessionToken]);

  const submitTyped = useCallback(() => {
    if (!typeValue.trim()) return;
    clientRef.current?.typeText(typeMode, typeValue.trim());
    setTypeValue(''); setTypeOpen(false);
  }, [typeMode, typeValue]);

  const mmss = useMemo(() => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`, [seconds]);

  // ── previews for screenshots: ?preview=1 | handoff | phone ──
  useEffect(() => {
    const pv = new URLSearchParams(window.location.search).get('preview');
    if (!pv) return;
    setPreview(pv);
    const demo: CaptionLine[] = [];
    const lines: [CaptionLine['role'], string][] = [
      ['assistant', 'Namaste, main Jansah hoon — ek independent seva. Boliye, kya hua?'],
      ['user', 'SBI ke naam se KYC call aaya tha, OTP maanga, OTP dete hi ek lakh kat gaya. Number tha 98125 54401.'],
      ['assistant', 'Samajh gaya, ghabraaiye mat — abhi file kar raha hoon. Isi tarah ke 20 cases pichhle 30 din mein Bengaluru se report hue hain — aap akele nahin hain, aur yeh number pehle 5 baar aaya hai.'],
      ['assistant', 'Apna Aadhaar number boliye.'],
      ['user', 'Ek do teen chaar, paanch chhe saat aath, sata aath chaar ek.'],
      ['assistant', 'OTP aapke registered mobile par SMS se bheja gaya hai — jo 6 digit aaye woh boliye.'],
      ['user', 'Chaar do chaar do chaar do.'],
      ['assistant', 'Verify ho gaya. Summary: SBI, UPI, ₹1,00,000, aaj — sahi hai?'],
    ];
    lines.forEach(([role, text], i) => demo.push({ id: `pv-${i}`, role, text, final: true }));
    setCaptions(demo);
    setSlotView({
      category: 'financial_upi', categoryLabel: 'UPI fraud',
      required: ['amount', 'incident_at', 'instrument', 'own_bank', 'narrative'],
      slots: { amount: 100000, instrument: 'upi', own_bank: 'State Bank of India', incident_at: 'Today, just now', suspect_contacts: [{ kind: 'phone', value: '9812554401' }] },
      identity: 'verified', aadhaarLast4: '7841', suspect: { value: '9812554401', matches: 5 }, flash: [],
    });
    setPattern({ pattern_title: 'Fake SBI KYC calls asking for OTP', count_30d: 20, top_regions: [{ region: 'Bengaluru', count: 20 }] });
    if (pv === 'phone') { setMode('phone'); setPhoneStatus('in_progress'); setPhoneMasked('+91••••••7841'); setSessionToken('preview'); return; }
    setMode('web'); setState('live'); setSessionToken('preview'); setSeconds(372);
    if (pv === 'handoff') setHandoff({ id: 'preview', status: 'accepted', name: 'Priya' });
  }, []);

  /* ══════════════ IDLE ══════════════ */
  if (mode === 'idle') {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
        <div className="disclaimer">Independent hackathon prototype. Not a government service. Use fictional details only.</div>
        <div className="wrap" style={{ maxWidth: 880, paddingTop: 'var(--sp-9)', paddingBottom: 'var(--sp-10)' }}>
          <BrandRow />
          <h1 style={{ fontSize: 34, marginTop: 'var(--sp-6)' }}>Two ways to talk to Jansah</h1>
          <p className="muted" style={{ marginTop: 'var(--sp-2)', maxWidth: '58ch' }}>Same agent, same documents either way. It listens in any language, fills the complaint as you speak, and reads every number back.</p>
          <div className="grid2" style={{ marginTop: 'var(--sp-6)', alignItems: 'stretch' }}>
            <div className="card" style={{ padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <span className="chip chip-neem" style={{ alignSelf: 'flex-start' }}>In the browser</span>
              <h2 style={{ fontSize: 22 }}>Talk right here</h2>
              <p className="muted" style={{ fontSize: 14 }}>Your browser will ask for the microphone — that&apos;s all we need. Live captions, and the form fills itself on screen.</p>
              <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={startWeb}><MicIcon /> Start the call</button>
            </div>
            <div className="card" id="callme" style={{ padding: 'var(--sp-6)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', borderColor: 'var(--haldi-200)' }}>
              <span className="chip chip-warn" style={{ alignSelf: 'flex-start' }}>No mic or weak internet?</span>
              <h2 style={{ fontSize: 22 }}>We call you</h2>
              <p className="muted" style={{ fontSize: 14 }}>Enter your mobile number. Your phone rings within seconds and Jansah talks to you on a normal call — this page shows the transcript live.</p>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <span className="input" style={{ width: 62, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)' }}>+91</span>
                <input className="input" inputMode="numeric" placeholder="98765 43210" value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value.replace(/[^0-9 ]/g, '').slice(0, 11))}
                  onKeyDown={(e) => { if (e.key === 'Enter') void startPhone(); }} disabled={!phoneAvail?.available} />
              </div>
              <p className="faint" style={{ fontSize: 11.5 }}>By tapping Call me you agree to receive one automated call from our +1 number. Standard incoming-call terms of your plan apply (usually free).</p>
              {phoneErr && <p style={{ color: 'var(--gerua-800)', fontSize: 13 }}>{phoneErr}</p>}
              <button className="btn" style={{ marginTop: 'auto', minHeight: 56, borderColor: 'var(--haldi-600)', color: 'var(--haldi-800)', fontWeight: 600 }}
                disabled={!phoneAvail?.available || phoneBusy || phoneInput.replace(/\D/g, '').length !== 10} onClick={() => void startPhone()}>
                📞 {phoneBusy ? 'Dialling…' : 'Call me'}
              </button>
              {phoneAvail && !phoneAvail.available && <p className="faint" style={{ fontSize: 11.5 }}>The phone line is being set up — the browser call works right now.</p>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-4)', marginTop: 'var(--sp-6)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link className="btn btn-sm" href="/track">Track an existing case</Link>
            <span className="faint" style={{ fontSize: 12.5 }}>Use fictional personal details. Sessions are capped at 10 minutes; transcripts are redacted and purged.</span>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════ WEB: connecting / error ══════════════ */
  if (mode === 'web' && (state === 'connecting' || state === 'error')) {
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
                  ? 'Allow microphone access in your browser (padlock icon → Site settings → Microphone), then try again — or use "We call you" instead.'
                  : `Something went wrong: ${errorDetail || 'unknown error'}. You can retry, use the phone option, or track a case.`}
              </p>
              <div style={{ display: 'flex', gap: 'var(--sp-4)', justifyContent: 'center', marginTop: 'var(--sp-6)', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={startWeb}>Try again</button>
                <button className="btn" onClick={() => setMode('idle')}>📞 We call you</button>
                <Link className="btn" href="/track">Track my case</Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════ ENDED (web or phone) ══════════════ */
  if (ended) {
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
                <button className="btn btn-sm" style={{ marginTop: 'var(--sp-3)' }} onClick={() => { void navigator.clipboard.writeText(result.caseNumber); }}>Copy number</button>
              </div>
              <div className="grid2" style={{ marginTop: 'var(--sp-4)', textAlign: 'left' }}>
                {(endedCase?.artifacts ?? []).map((a) => (
                  <div key={a.id} className="row" style={{ minHeight: 56 }}><span>{a.label_en}</span><a className="dl" href={artifactUrl(a.id, result.caseToken)} target="_blank" rel="noreferrer">Download</a></div>
                ))}
                {(endedCase?.artifacts ?? []).length === 0 && (
                  <div className="row" style={{ minHeight: 56 }}><span className="faint">Documents are being generated…</span><LoadingLoop size={20} /></div>
                )}
              </div>
              {endedCase?.pattern && (
                <div style={{ background: 'var(--gerua-100)', color: 'var(--gerua-800)', borderRadius: 'var(--r-3)', padding: 'var(--sp-4)', marginTop: 'var(--sp-4)', fontSize: 14 }}>
                  Matches a recognised pattern — <b>{endedCase.pattern.count_30d} similar reports</b> in 30 days{endedCase.pattern.top_region ? `, most from ${endedCase.pattern.top_region}` : ''}. <Link href="/patterns">See the radar</Link>
                </div>
              )}
              <div className="callout-neem" style={{ marginTop: 'var(--sp-4)', fontSize: 14, color: 'var(--neem-900)' }}>
                {endedCase?.case.email_on_file ? 'Copy emailed with attachments · ' : ''}{slotView.category?.startsWith('financial') ? 'freeze request sent · ' : ''}if no FIR by day 15, your police pack arrives ready to sign.
              </div>
              <Link className="btn" style={{ marginTop: 'var(--sp-6)', display: 'inline-flex' }} href={`/track?case=${result.caseNumber}`}>View case status</Link>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 30 }}>{mode === 'phone' ? (phoneStatus === 'no-answer' || phoneStatus === 'busy' ? 'We could not reach you' : 'Call ended') : 'Call ended'}</h1>
              <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>
                {mode === 'phone' && phoneStatus === 'failed' ? 'The call could not be placed. On the trial line only verified numbers can be called.' : 'No complaint was registered in this call.'}
              </p>
              <div style={{ display: 'flex', gap: 'var(--sp-4)', justifyContent: 'center', marginTop: 'var(--sp-6)', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => { setMode('idle'); setState('idle'); }}>Try again</button>
                <Link className="btn" href="/">Home</Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════ LIVE (web) or IN-CALL (phone) ══════════════ */
  const sidebarRows = (slotView.required.length > 0 ? slotView.required : Object.keys(slotView.slots)).map((k) => ({
    key: k, label: SLOT_LABELS[k] ?? k, value: slotDisplay(k, slotView.slots[k]),
    filled: slotView.slots[k] !== undefined && slotView.slots[k] !== null,
    suspect: k === 'payee_identifier' && !!slotView.suspect && slotView.suspect.matches > 0,
  }));
  const phoneLive = mode === 'phone';
  const ringing = phoneLive && ['requested', 'ringing', 'queued', 'initiated'].includes(phoneStatus);

  return (
    <div style={{ background: 'var(--paper)', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="nav" style={{ flex: 'none' }}>
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="brandrow">
            <JansahMark size={32} />
            <span className="wordmark">Jansah<span>.AI</span></span>
            <span className={`chip ${phoneLive ? 'chip-warn' : 'chip-line'}`} style={{ marginLeft: 'var(--sp-3)' }}>{phoneLive ? '📞 Phone call' : 'Prototype'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            {phoneLive ? (
              <span className="muted" style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                {ringing ? <><LoadingLoop size={18} /> Ringing {phoneMasked}…</> : <><span className="pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--neem-600)' }} /> On the call · {phoneMasked}</>}
              </span>
            ) : (
              <>
                <span className="muted" style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg className="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>{mmss} left
                </span>
                <button className="btn btn-sm" style={{ color: 'var(--gerua-800)' }} onClick={endCall}>End call</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="wrap call-grid" style={{ flex: 1, minHeight: 0, paddingTop: 'var(--sp-5)', paddingBottom: 'var(--sp-5)', display: 'grid', gap: 'var(--sp-5)', gridTemplateColumns: '1fr', gridTemplateRows: 'minmax(0, 1fr) auto', width: '100%' }}>
        {/* captions column */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <span className="pulse" style={{ width: 10, height: 10, borderRadius: '50%', background: handoff?.status === 'accepted' ? 'var(--haldi-600)' : 'var(--neem-600)' }} />
            <span className="muted" style={{ fontSize: 14 }}>
              {handoff?.status === 'accepted' ? `${handoff.name ?? 'Desk'} is with you · voice paused` : activeTool ? `Working… (${activeTool})` : phoneLive ? (ringing ? 'Pick up your phone — the transcript appears here' : 'Listening on the phone · किसी भी भाषा में') : 'Listening — speak in any language · किसी भी भाषा में'}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {!phoneLive && <button className="chip chip-line" onClick={() => setTypeOpen((o) => !o)}>⌨ Type instead</button>}
              {!handoff && <button className="chip chip-line" style={{ borderColor: 'var(--haldi-200)', color: 'var(--haldi-800)' }} onClick={() => void askHuman()}>🙋 Talk to a human</button>}
            </span>
          </div>

          {typeOpen && !phoneLive && (
            <div className="card-tint toast-in" style={{ flex: 'none', marginBottom: 'var(--sp-3)' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
                {TYPE_MODES.map((m) => <button key={m.key} className={`chip ${typeMode === m.key ? 'chip-neem' : 'chip-line'}`} onClick={() => setTypeMode(m.key)}>{m.key}</button>)}
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                <input className="input" placeholder={TYPE_MODES.find((m) => m.key === typeMode)?.hint} value={typeValue} onChange={(e) => setTypeValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitTyped(); }} autoFocus />
                <button className="btn" onClick={submitTyped}>Send</button>
              </div>
            </div>
          )}

          <div ref={captionsScrollRef} aria-live="polite"
            onScroll={(e) => { const el = e.currentTarget; nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', paddingRight: 6, paddingBottom: 'var(--sp-2)', scrollBehavior: 'smooth' }}>
            {captions.map((c2) => (
              <div key={`${c2.role}-${c2.id}`} className={`bubble ${c2.role === 'assistant' ? 'bubble-a' : 'bubble-u'}`} style={{ opacity: c2.final ? 1 : 0.75, maxWidth: '78%', flex: 'none' }}>{c2.text}</div>
            ))}
            {captions.length === 0 && (
              <p className="faint" style={{ fontSize: 13.5 }}>{phoneLive ? (ringing ? 'Your phone is ringing…' : 'Say hello on the phone — captions will appear here.') : 'Say hello — Jansah will greet you and ask what happened.'}</p>
            )}
          </div>
        </div>

        {/* sidebar column */}
        <div className="call-sidebar" style={{ minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {handoff && sessionToken && (
            preview ? (
              <div className="card-tint" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                <div className="callout-neem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 12px' }}><span style={{ fontSize: 13 }}><b>Priya joined</b> · Jansah desk · voice paused</span><span className="chip chip-neem">human</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="bubble bubble-h" style={{ maxWidth: '85%' }}><b>Priya:</b> Namaste Ravi ji, main Priya. Aapka ₹1 lakh wala case mere saamne hai — freeze request ja chuki hai. Aap kya jaanna chahte hain?</div>
                  <div className="bubble bubble-u" style={{ maxWidth: '85%' }}>Paisa kab tak wapas aayega?</div>
                  <div className="bubble bubble-h" style={{ maxWidth: '85%' }}><b>Priya:</b> Hold confirm hone par restoration request lagti hai — main 2 din mein call karke batati hoon.</div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--sp-2)' }}><input className="input" style={{ minHeight: 42 }} placeholder="Message Priya…" readOnly /><button className="btn btn-sm">Send</button></div>
              </div>
            ) : (
              <HandoffPanel token={sessionToken} handoffId={handoff.id} channel={phoneLive ? 'phone' : 'web'}
                onStatus={(status, name) => setHandoff((h) => (h ? { ...h, status, name: name ?? h.name } : h))} />
            )
          )}

          {toasts.map((t) => (
            <div key={t.id} className="toast toast-in" onClick={() => setToasts((all) => all.map((x) => x.id === t.id ? { ...x, pinned: !x.pinned } : x))}>
              <p className="faint" style={{ fontSize: 11 }}>Messages · now (simulated SMS)</p>
              <p style={{ fontSize: 13, marginTop: 2 }}>{t.text}</p>
            </div>
          ))}

          <div className="card-tint" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-3)' }}>
              <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Your complaint</span>
              {slotView.categoryLabel ? <span className={`chip chip-neem ${slotView.flash.includes('__category') ? 'flash' : ''}`}>{slotView.categoryLabel}</span> : <span className="chip chip-line">listening…</span>}
            </div>
            <div className="stack-2">
              {sidebarRows.map((r) => (
                <div key={r.key} className={`row ${slotView.flash.includes(r.key) ? 'flash' : ''}`} style={{ borderColor: r.suspect ? 'var(--gerua-200)' : undefined, borderStyle: r.filled ? 'solid' : 'dashed' }}>
                  <span className={r.filled ? 'muted' : 'faint'}>{r.label}</span>
                  {r.suspect ? <span style={{ color: 'var(--gerua-800)', fontSize: 12.5 }}>{r.value} · {slotView.suspect?.matches} reports</span>
                    : <span className={r.filled ? '' : 'faint'} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>{r.value} {r.filled && <svg className="ic" style={{ color: 'var(--neem-700)', width: 14, height: 14 }} viewBox="0 0 24 24"><path d="m4 12 5 5L20 6" /></svg>}</span>}
                </div>
              ))}
              {slotView.suspect && !sidebarRows.some((r) => r.suspect) && (
                <div className="row flash" style={{ borderColor: slotView.suspect.matches > 0 ? 'var(--gerua-200)' : undefined }}>
                  <span className="muted">Suspect check</span>
                  <span style={{ color: slotView.suspect.matches > 0 ? 'var(--gerua-800)' : undefined, fontSize: 12.5 }}>{slotView.suspect.value} · {slotView.suspect.matches} reports</span>
                </div>
              )}
              {pattern && (
                <div className="row flash" style={{ borderColor: 'var(--gerua-200)' }}>
                  <span className="muted">Pattern</span>
                  <span className="chip chip-sim" title={pattern.pattern_title}>{pattern.count_30d} similar · 30d{pattern.top_regions[0] ? ` · ${pattern.top_regions[0].region}` : ''}</span>
                </div>
              )}
              <div className={`row ${slotView.flash.includes('__identity') ? 'flash' : ''}`} style={{ borderStyle: slotView.identity === 'none' ? 'dashed' : 'solid' }}>
                <span className="muted">Identity</span>
                <span className={slotView.identity === 'none' ? 'faint' : ''} style={{ fontSize: 13 }}>
                  {slotView.identity === 'anonymous' && 'Anonymous ✓ (by design)'}{slotView.identity === 'verified' && `Aadhaar ••${slotView.aadhaarLast4} ✓`}{slotView.identity === 'otp_sent' && `Aadhaar ••${slotView.aadhaarLast4} · verifying…`}{slotView.identity === 'none' && '—'}
                </span>
              </div>
              <div className={`row ${slotView.flash.includes('__email') ? 'flash' : ''}`} style={{ borderStyle: slotView.email ? 'solid' : 'dashed' }}>
                <span className="faint">Email (optional)</span><span className={slotView.email ? '' : 'faint'} style={{ fontSize: 13 }}>{slotView.email ?? (phoneLive ? phoneMasked : '—')}</span>
              </div>
            </div>
            <p className="faint" style={{ fontSize: 11.5, marginTop: 'var(--sp-3)' }}>{phoneLive ? 'Filling in from your phone call. Numbers are read back before saving.' : 'Fields update live as you speak. Numbers are always read back before saving.'}</p>
          </div>
        </div>
      </div>
      <style>{`
        .call-sidebar { max-height: 42dvh; }
        @media (min-width: 900px) {
          .call-grid { grid-template-columns: 1.5fr 1fr !important; grid-template-rows: minmax(0, 1fr) !important; gap: var(--sp-7) !important; }
          .call-sidebar { max-height: none; }
        }
      `}</style>
    </div>
  );
}
