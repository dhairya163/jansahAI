'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, Clock3, Keyboard, Mic2, PhoneOff, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { API_URL, api, caseTokenKey, voiceDraftKey, voiceSessionKey } from '@/lib/api';
import { cn } from '@/lib/utils';

const categories = [
  { id: 'financial_upi', title: 'UPI or payment fraud', hint: 'UPI, QR, bank, card, or wallet', group: 'Financial' },
  { id: 'financial_courier_customs', title: 'Courier or parcel scam', hint: 'Fake customs, police, or parcel demand', group: 'Financial' },
  { id: 'digital_arrest_no_loss', title: 'Digital arrest attempt', hint: 'Agency impersonation; no money sent', group: 'Urgent' },
  { id: 'wc_ncii', title: 'Intimate-image abuse', hint: 'Images shared or threatened without consent', group: 'Sensitive' },
  { id: 'wc_stalking', title: 'Cyberstalking or harassment', hint: 'Repeated threats, tracking, or contact', group: 'Sensitive' },
  { id: 'social_impersonation', title: 'Fake profile or impersonation', hint: 'Someone pretending to be you online', group: 'Other' },
  { id: 'account_takeover', title: 'Account hacked', hint: 'Lost access to email or social account', group: 'Other' },
  { id: 'hacking_ransomware', title: 'Hacking or ransomware', hint: 'Device, website, or files compromised', group: 'Other' },
  { id: 'telecom_fraud', title: 'Suspicious call, SMS, or SIM', hint: 'Suspicious communication, no loss yet', group: 'Other' },
  { id: 'generic_other', title: 'Something else', hint: 'There is no wrong door', group: 'Other' },
] as const;

const INITIAL_FORM = { narrative: '', amount: '', incidentAt: '', ownBank: '', payee: '', reporterName: '', phone: '', email: '', aadhaar: '', platforms: '', urls: '', anonymous: false, onBehalfOf: false, victimName: '' };
type FormState = typeof INITIAL_FORM;
type TranscriptMessage = { id: string; role: 'citizen' | 'agent'; text: string };
type VoiceDraft = {
  session_id?: string;
  language?: 'und' | 'en' | 'hi' | 'hi-en';
  category?: string;
  anonymous?: boolean;
  on_behalf_of?: boolean;
  slots?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  case_number?: string;
};
type RealtimeEvent = { type?: unknown; transcript?: unknown; item_id?: unknown };
type OrchestratorResponse = { duplicate?: boolean; reply?: string; draft?: VoiceDraft; access_token?: string; error?: { message?: string } };

const financial = (category: string) => category.startsWith('financial_');
const sensitive = (category: string) => category.startsWith('wc_');
const toText = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
const toCsv = (value: unknown) => Array.isArray(value) ? value.map(toText).filter(Boolean).join(', ') : toText(value);
const toLocalDate = (value: unknown) => {
  const source = toText(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(source) ? source.slice(0, 16) : source;
};

export function CallClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'idle' | 'guided' | 'connecting' | 'live'>('idle');
  const [category, setCategory] = useState('');
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [voiceName, setVoiceName] = useState('marin');
  const [registeredCase, setRegisteredCase] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [timer, setTimer] = useState(600);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const tokenRef = useRef('');
  const transcriptIdsRef = useRef(new Set<string>());
  const orchestrationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const speechQueueRef = useRef<string[]>([]);
  const responseActiveRef = useRef(false);
  const selected = categories.find((item) => item.id === category);

  useEffect(() => {
    if (mode !== 'live') return;
    const handle = window.setInterval(() => setTimer((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(handle);
  }, [mode]);

  useEffect(() => () => {
    peerRef.current?.close();
    mediaRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const set = (key: keyof FormState, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  function applyDraft(draft?: VoiceDraft) {
    if (!draft) return;
    const slots = draft.slots ?? {};
    const contact = draft.contact ?? {};
    if (draft.category) setCategory(draft.category);
    setForm((current) => ({
      ...current,
      narrative: toText(slots.narrative) || current.narrative,
      amount: toText(slots.amount) || current.amount,
      incidentAt: toLocalDate(slots.incident_at ?? slots.when ?? slots.first_seen_at) || current.incidentAt,
      ownBank: toText(slots.own_bank) || current.ownBank,
      payee: toText(slots.payee_identifier) || current.payee,
      platforms: toCsv(slots.platforms) || current.platforms,
      urls: toCsv(slots.urls) || current.urls,
      reporterName: toText(contact.reporter_name) || current.reporterName,
      victimName: toText(contact.victim_name) || current.victimName,
      phone: toText(contact.phone) || current.phone,
      email: toText(contact.email) || current.email,
      aadhaar: toText(slots.aadhaar_last4) || current.aadhaar,
      anonymous: draft.anonymous ?? current.anonymous,
      onBehalfOf: draft.on_behalf_of ?? current.onBehalfOf,
    }));
    localStorage.setItem(voiceDraftKey, JSON.stringify(draft));
  }

  function appendTranscript(role: TranscriptMessage['role'], transcript: string, itemId?: string) {
    const clean = transcript.trim();
    if (!clean) return false;
    const id = `${role}:${itemId ?? clean}`;
    if (transcriptIdsRef.current.has(id)) return false;
    transcriptIdsRef.current.add(id);
    setMessages((current) => [...current, { id, role, text: clean }]);
    return true;
  }

  function flushSpeechQueue(channel: RTCDataChannel) {
    if (responseActiveRef.current || channel.readyState !== 'open') return;
    const safeReply = speechQueueRef.current.shift();
    if (!safeReply) return;
    responseActiveRef.current = true;
    channel.send(JSON.stringify({
      type: 'response.create',
      response: {
        input: [],
        output_modalities: ['audio'],
        instructions: `Say exactly the text inside the speech tags once. Do not translate, repeat, preface, paraphrase, or add anything.\n<speech>${safeReply}</speech>`,
      },
    }));
  }

  function speakExact(channel: RTCDataChannel, reply: string) {
    const safeReply = reply.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    if (!safeReply) return;
    speechQueueRef.current.push(safeReply);
    flushSpeechQueue(channel);
  }

  function queueOrchestratorTurn(channel: RTCDataChannel, sessionToken: string, input: { start?: boolean; transcript?: string; item_id?: string }) {
    orchestrationQueueRef.current = orchestrationQueueRef.current.then(async () => {
      const response = await fetch(`${API_URL}/api/realtime/session/orchestrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
        body: JSON.stringify(input),
      });
      const output = await response.json() as OrchestratorResponse;
      if (!response.ok) throw new Error(output.error?.message || 'The voice agent could not save that answer.');
      applyDraft(output.draft);
      if (output.duplicate || !output.reply) return;
      appendTranscript('agent', output.reply, input.start ? 'orchestrator:opening' : `orchestrator:${input.item_id ?? output.reply}`);
      const caseNumber = toText(output.draft?.case_number);
      if (caseNumber && output.access_token) {
        sessionStorage.setItem(caseTokenKey(caseNumber), output.access_token);
        setRegisteredCase(caseNumber);
      }
      speakExact(channel, output.reply);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'The voice agent could not process that answer.');
    });
  }

  async function endVoice(switchToGuided = true) {
    peerRef.current?.close();
    peerRef.current = null;
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    mediaRef.current = null;
    speechQueueRef.current = [];
    responseActiveRef.current = false;
    if (tokenRef.current) {
      await fetch(`${API_URL}/api/realtime/session/end`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Token': tokenRef.current } }).catch(() => undefined);
      tokenRef.current = '';
    }
    if (switchToGuided) { setMode('guided'); setStep(category ? 2 : 1); }
  }

  async function startVoice() {
    setError('');
    setMode('connecting');
    setMessages([]);
    setRegisteredCase('');
    transcriptIdsRef.current.clear();
    orchestrationQueueRef.current = Promise.resolve();
    speechQueueRef.current = [];
    responseActiveRef.current = false;
    try {
      const session = await api.createVoiceSession();
      if (!session.enabled) {
        setMode('guided');
        setStep(1);
        setError('Live voice is unavailable. Guided intake is ready now.');
        return;
      }
      tokenRef.current = session.session_token;
      setSessionId(session.session_id);
      setVoiceName(session.voice);
      setTimer(session.maxMinutes * 60);
      localStorage.setItem(voiceSessionKey, session.session_id);

      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      const audio = document.createElement('audio');
      audio.autoplay = true;
      pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = media;
      pc.addTrack(media.getTracks()[0]);

      const channel = pc.createDataChannel('oai-events');
      channel.addEventListener('open', () => queueOrchestratorTurn(channel, session.session_token, { start: true }));
      channel.addEventListener('message', (event) => {
        let parsed: unknown;
        try { parsed = JSON.parse(event.data); } catch { return; }
        if (!parsed || typeof parsed !== 'object') return;
        const message = parsed as RealtimeEvent;
        const itemId = typeof message.item_id === 'string' ? message.item_id : undefined;

        if (message.type === 'response.done') {
          responseActiveRef.current = false;
          flushSpeechQueue(channel);
        }

        if (message.type === 'conversation.item.input_audio_transcription.completed') {
          const transcript = toText(message.transcript).trim();
          if (appendTranscript('citizen', transcript, itemId)) {
            queueOrchestratorTurn(channel, session.session_token, { transcript, item_id: itemId });
          }
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch(`${API_URL}/api/realtime/connect`, { method: 'POST', headers: { 'Content-Type': 'application/sdp', 'X-Session-Token': session.session_token }, body: offer.sdp });
      if (!response.ok) throw new Error('Could not start the voice connection.');
      await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
      setMode('live');
      setStep(1);
    } catch (reason) {
      await endVoice(false);
      setMode('guided');
      setStep(1);
      setError(reason instanceof Error ? `${reason.message} Continuing with guided intake.` : 'Voice unavailable. Continuing with guided intake.');
    }
  }

  function next() {
    setError('');
    if (step === 1 && !category) return setError('Choose the option that best matches what happened.');
    if (step === 2 && form.narrative.trim().length < 20) return setError('Please add a little more detail so the complaint is useful.');
    if (step === 3 && !form.anonymous && !form.reporterName.trim()) return setError('Add a fictional name, or choose anonymous filing where available.');
    setStep((value) => Math.min(4, value + 1));
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const slots: Record<string, unknown> = {
        own_bank: form.ownBank || undefined,
        payee_identifier: form.payee || undefined,
        instrument: financial(category) ? 'upi' : undefined,
        platforms: form.platforms ? form.platforms.split(',').map((value) => value.trim()) : undefined,
        urls: form.urls ? form.urls.split(',').map((value) => value.trim()) : undefined,
        suspect_contacts: form.payee ? [{ kind: form.payee.includes('@') ? 'upi' : 'phone', value: form.payee }] : [],
      };
      const response = await api.register({ category, language: 'hi-en', anonymous: form.anonymous, onBehalfOf: form.onBehalfOf, reporterName: form.reporterName || undefined, victimName: form.victimName || undefined, phone: form.phone || undefined, email: form.email || undefined, aadhaar: form.aadhaar || undefined, amount: form.amount ? Number(form.amount) : undefined, incidentAt: form.incidentAt ? new Date(form.incidentAt).toISOString() : undefined, narrative: form.narrative, slots });
      sessionStorage.setItem(caseTokenKey(response.bundle.case.caseNumber), response.accessToken);
      router.push(`/case/${response.bundle.case.caseNumber}?new=1&demo=1`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not register the case.');
      setSubmitting(false);
    }
  }

  if (step === 0) return <Landing startVoice={startVoice} useGuided={() => { setMode('guided'); setStep(1); }} />;

  return <section>
    <div className="border-b border-[var(--line)] bg-white"><div className="jansah-wrap flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3"><span className="jansah-chip jansah-chip-warn">Prototype</span><span className="flex items-center gap-2 text-sm text-[var(--ink-2)]"><span className={cn('size-2 rounded-full', mode === 'live' ? 'animate-pulse bg-[var(--neem-600)]' : 'bg-[var(--haldi-600)]')} />{mode === 'live' ? 'Listening · हिंदी, Hinglish or English' : 'Guided intake · किसी भी भाषा में'}</span></div>
      <div className="flex items-center gap-4"><span className="flex items-center gap-1.5 text-sm text-[var(--ink-2)]"><Clock3 className="size-4" />{String(Math.floor(timer / 60)).padStart(2, '0')}:{String(timer % 60).padStart(2, '0')} left</span>{mode === 'live' && <button onClick={() => void endVoice()} className="jansah-chip jansah-chip-line text-[var(--gerua-800)]"><PhoneOff className="size-3.5" />End call</button>}</div>
    </div></div>

    <div className="jansah-wrap grid gap-6 py-6 lg:grid-cols-[1.5fr_1fr] lg:items-start lg:py-8">
      <div>
        {error && <div className="mb-4 flex items-start gap-2 rounded-2xl border border-[var(--gerua-200)] bg-[var(--gerua-100)] p-3 text-sm text-[var(--gerua-800)]"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}
        {mode === 'live'
          ? <LiveConversation messages={messages} sessionId={sessionId} voiceName={voiceName} registeredCase={registeredCase} viewCase={(caseNumber) => router.push(`/case/${caseNumber}?new=1&demo=1`)} />
          : <GuidedCard step={step} setStep={setStep} category={category} setCategory={setCategory} form={form} set={set} selected={selected} next={next} submit={submit} submitting={submitting} />}
      </div>
      <Summary form={form} selected={selected} mode={mode} sessionId={sessionId} />
    </div>
  </section>;
}

function Landing({ startVoice, useGuided }: { startVoice: () => void; useGuided: () => void }) {
  return <section className="jansah-wrap grid gap-8 py-10 sm:py-20 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:gap-16">
    <div><span className="jansah-chip jansah-chip-neem">Private, redacted, fictional</span><h1 className="mt-5 text-[30px] font-semibold sm:text-[44px]">Take a breath.<br />Start with what happened.</h1><p className="mt-3 max-w-xl text-[14.5px] leading-6 text-[var(--ink-2)] sm:text-base">Speak naturally or use the guided form. Both create the same complaint, documents, and follow-through timeline.</p><div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button onClick={startVoice} className="h-14 rounded-2xl bg-[var(--neem-700)] px-6 text-base hover:bg-[var(--neem-600)]"><Mic2 />Start voice intake</Button><Button variant="outline" onClick={useGuided} className="h-14 rounded-2xl bg-white px-6 text-base"><Keyboard />Use guided form</Button></div></div>
    <div className="jansah-card-tint p-5"><p className="text-xs text-[var(--ink-3)]">Before we begin</p><div className="mt-4 space-y-3 text-[13.5px]">{[['1', 'Use fictional details', 'Never enter a real Aadhaar, OTP, PIN, CVV, or password.'], ['2', 'You stay in control', 'Review every detail before registration.'], ['3', 'No authority contact', 'Bank, police, and platform actions are visibly simulated.']].map(([n, title, body]) => <div key={n} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--neem-100)] text-xs text-[var(--neem-900)]">{n}</span><div><p className="font-medium">{title}</p><p className="text-[var(--ink-2)]">{body}</p></div></div>)}</div></div>
  </section>;
}

function LiveConversation({ messages, sessionId, voiceName, registeredCase, viewCase }: { messages: TranscriptMessage[]; sessionId: string; voiceName: string; registeredCase: string; viewCase: (caseNumber: string) => void }) {
  return <div className="jansah-card overflow-hidden">
    <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 sm:px-6"><div><p className="text-sm font-medium">Live conversation</p><p className="text-[11px] text-[var(--ink-3)]">Stable voice: {voiceName} · Session {sessionId.slice(0, 8)}…</p></div><span className="jansah-chip jansah-chip-neem"><Mic2 className="size-3.5" />Live</span></div>
    <div className="min-h-[360px] max-h-[560px] space-y-4 overflow-y-auto bg-[var(--paper-1)] p-4 sm:p-6" aria-live="polite">
      {messages.length === 0 && <div className="mx-auto max-w-sm py-16 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--neem-100)] text-[var(--neem-700)]"><Mic2 /></span><p className="mt-4 font-medium">You’re connected</p><p className="mt-1 text-sm text-[var(--ink-2)]">Speak naturally. Confirmed answers will appear in the complaint summary.</p></div>}
      {messages.map((message) => <div key={message.id} className={cn('flex gap-3', message.role === 'citizen' && 'flex-row-reverse')}><span className={cn('grid size-8 shrink-0 place-items-center rounded-full', message.role === 'agent' ? 'bg-[var(--neem-700)] text-white' : 'bg-white text-[var(--ink-2)]')}>{message.role === 'agent' ? <Bot className="size-4" /> : <UserRound className="size-4" />}</span><div className={cn('max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6', message.role === 'agent' ? 'rounded-tl-sm bg-white' : 'rounded-tr-sm bg-[var(--neem-100)]')}>{message.text}</div></div>)}
    </div>
    <div className="border-t border-[var(--line)] px-4 py-3 sm:px-6"><p className="text-xs text-[var(--ink-3)]">The agent asks for every required detail and fills the complaint automatically. The backend saves each redacted answer against this session.</p></div>
    {registeredCase && <div className="border-t border-[var(--neem-200)] bg-[var(--neem-100)] p-4 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-[var(--neem-900)]">Case registered</p><p className="jansah-mono text-sm">{registeredCase}</p></div><Button onClick={() => viewCase(registeredCase)} className="rounded-xl bg-[var(--neem-700)]">View case<ArrowRight /></Button></div></div>}
  </div>;
}

function Summary({ form, selected, mode, sessionId }: { form: FormState; selected?: (typeof categories)[number]; mode: string; sessionId: string }) {
  return <aside className="space-y-4 lg:sticky lg:top-6">
    <div className="jansah-card-tint p-5"><div className="flex items-center justify-between gap-3"><span className="text-[13px] font-medium text-[var(--ink-2)]">Your complaint</span><span className="jansah-chip jansah-chip-neem">{selected?.title ?? 'Listening…'}</span></div><div className="mt-3 space-y-2">{[['Amount lost', form.amount ? `₹${Number(form.amount).toLocaleString('en-IN')} ✓` : '—'], ['Payee / suspect', form.payee || '—'], ['When', form.incidentAt || '—'], ['Identity', form.anonymous ? 'Anonymous' : form.aadhaar ? `Aadhaar ••${form.aadhaar.slice(-4)}` : form.reporterName || '—'], ['Email (optional)', form.email || '—']].map(([label, value]) => <div key={label} className={cn('jansah-row flex items-center justify-between gap-3 px-4 py-2 text-[13px]', label === 'Payee / suspect' && form.payee && 'border-[var(--gerua-200)]')}><span className="text-[var(--ink-2)]">{label}</span><span className={cn('max-w-[58%] truncate text-right', label === 'Payee / suspect' && form.payee && 'text-[var(--gerua-800)]')}>{value}</span></div>)}</div><p className="mt-3 text-[11.5px] text-[var(--ink-3)]">Fields update automatically from confirmed conversation details.</p></div>
    {mode === 'live' && <div className="rounded-2xl border border-[var(--line-2)] bg-white p-4 text-xs text-[var(--ink-2)]"><p className="font-medium text-[var(--ink-1)]">Session saved</p><p className="mt-1 break-all font-mono">{sessionId}</p><p className="mt-2 text-[var(--ink-3)]">This UUID is also stored in this browser.</p></div>}
  </aside>;
}

function GuidedCard({ step, setStep, category, setCategory, form, set, selected, next, submit, submitting }: { step: number; setStep: React.Dispatch<React.SetStateAction<number>>; category: string; setCategory: (value: string) => void; form: FormState; set: (key: keyof FormState, value: string | boolean) => void; selected?: (typeof categories)[number]; next: () => void; submit: () => void; submitting: boolean }) {
  return <div className="jansah-card p-4 sm:p-6">
    <p className="text-xs font-medium text-[var(--ink-3)]">Step {step} of 4</p>
    {step === 1 && <div><h1 className="mt-2 text-2xl font-semibold sm:text-[30px]">What best matches what happened?</h1><div className="mt-5 grid gap-2 sm:grid-cols-2">{categories.map((item) => <button key={item.id} onClick={() => { setCategory(item.id); if (!sensitive(item.id)) set('anonymous', false); }} className={cn('jansah-row min-h-[76px] p-3 text-left transition', category === item.id ? 'border-[var(--neem-700)] bg-[var(--neem-100)]' : 'hover:bg-[var(--paper-1)]')}><div className="flex items-start justify-between"><div><span className="text-[10px] uppercase tracking-[.08em] text-[var(--ink-3)]">{item.group}</span><h2 className="font-sans text-[13.5px] font-medium">{item.title}</h2></div>{category === item.id && <CheckCircle2 className="size-4 text-[var(--neem-700)]" />}</div><p className="mt-0.5 text-xs text-[var(--ink-2)]">{item.hint}</p></button>)}</div></div>}
    {step === 2 && <div><h1 className="mt-2 text-2xl font-semibold">Tell us the story in your words.</h1><p className="mt-2 text-[13.5px] text-[var(--ink-2)]">Voice answers already captured are filled here. Review or edit them before continuing.</p><div className="mt-5 text-[13.5px] font-medium"><p>What happened?</p><Textarea aria-label="What happened?" value={form.narrative} onChange={(event) => set('narrative', event.target.value)} className="mt-2 min-h-36 rounded-xl bg-white p-4" /></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="When did it happen?"><Input aria-label="When did it happen?" type="datetime-local" value={form.incidentAt} onChange={(event) => set('incidentAt', event.target.value)} /></Field>{financial(category) && <><Field label="Amount lost (₹)"><Input aria-label="Amount lost" inputMode="numeric" value={form.amount} onChange={(event) => set('amount', event.target.value.replace(/\D/g, ''))} /></Field><Field label="Your bank"><Input aria-label="Your bank" value={form.ownBank} onChange={(event) => set('ownBank', event.target.value)} /></Field><Field label="UPI ID / suspect identifier"><Input aria-label="UPI ID or suspect identifier" value={form.payee} onChange={(event) => set('payee', event.target.value)} /></Field></>}{(sensitive(category) || category === 'social_impersonation') && <><Field label="Platforms"><Input aria-label="Platforms" value={form.platforms} onChange={(event) => set('platforms', event.target.value)} /></Field><Field label="URLs or handles"><Input aria-label="URLs or handles" value={form.urls} onChange={(event) => set('urls', event.target.value)} /></Field></>}</div></div>}
    {step === 3 && <div><h1 className="mt-2 text-2xl font-semibold">Where should your documents go?</h1>{sensitive(category) && <div className="jansah-callout-neem mt-5 flex items-center gap-3 p-4"><Checkbox aria-label="File anonymously" checked={form.anonymous} onCheckedChange={(value) => set('anonymous', Boolean(value))} /><span><span className="block font-medium">File anonymously</span><span className="text-xs text-[var(--neem-700)]">No name or identity details required.</span></span></div>}{!form.anonymous && <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Fictional full name"><Input aria-label="Fictional full name" value={form.reporterName} onChange={(event) => set('reporterName', event.target.value)} /></Field><Field label="Fictional phone"><Input aria-label="Fictional phone" value={form.phone} onChange={(event) => set('phone', event.target.value)} /></Field><Field label="Fictional Aadhaar"><Input aria-label="Fictional Aadhaar" value={form.aadhaar} onChange={(event) => set('aadhaar', event.target.value.replace(/\D/g, '').slice(0, 12))} /></Field><Field label="Email for documents (optional)"><Input aria-label="Email for documents" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} /></Field></div>}<div className="jansah-row mt-4 flex items-center gap-3 p-4"><Checkbox aria-label="Reporting for someone else" checked={form.onBehalfOf} onCheckedChange={(value) => set('onBehalfOf', Boolean(value))} /><span className="text-[13.5px] font-medium">I’m reporting for someone else</span></div>{form.onBehalfOf && <div className="mt-4"><Field label="Victim’s fictional name"><Input aria-label="Victim's fictional name" value={form.victimName} onChange={(event) => set('victimName', event.target.value)} /></Field></div>}</div>}
    {step === 4 && <div><div className="grid size-12 place-items-center rounded-full bg-[var(--neem-100)] text-[var(--neem-700)]"><Check className="size-6" /></div><h1 className="mt-4 text-2xl font-semibold">Read this back before we register it.</h1><div className="mt-5 divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)]">{[['Category', selected?.title], ['Narrative', form.narrative], ['Amount', form.amount ? `₹${Number(form.amount).toLocaleString('en-IN')}` : '—'], ['Identity', form.anonymous ? 'Anonymous' : form.reporterName], ['Email', form.email || 'Not provided']].map(([label, value]) => <div key={label} className="grid gap-1 bg-white px-4 py-3 sm:grid-cols-[120px_1fr]"><span className="text-[13px] text-[var(--ink-2)]">{label}</span><span className="text-[13.5px] font-medium">{value}</span></div>)}</div><Button onClick={submit} disabled={submitting} className="mt-5 h-14 w-full rounded-2xl bg-[var(--neem-700)] text-base hover:bg-[var(--neem-600)]">{submitting ? 'Registering securely…' : 'Confirm & register case'}<ArrowRight /></Button></div>}
    <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-4"><Button variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} className="h-11 rounded-xl"><ArrowLeft />Back</Button>{step < 4 && <Button onClick={next} className="h-11 rounded-xl bg-[var(--neem-700)] px-5 hover:bg-[var(--neem-600)]">Continue<ArrowRight /></Button>}</div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="text-[13.5px] font-medium"><p>{label}</p><span className="mt-2 block [&_input]:h-12 [&_input]:rounded-xl [&_input]:bg-white">{children}</span></div>;
}
