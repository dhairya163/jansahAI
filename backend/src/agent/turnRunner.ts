import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { voiceSessions, handoffMessages, type VoiceSessionRow } from '../db/schema.js';
import { config } from '../config.js';
import { buildSessionConfig, chatWithTools, type ChatMsg } from './realtime.js';
import { handleTool, ToolError } from './toolHandlers.js';
import { PhoneRunner } from './phoneRunner.js';
import { broadcast } from '../lib/supabase.js';
import { redact, redactDeep } from '../lib/redact.js';
import { twilioHangup } from '../lib/twilio.js';
import { detectLang, updateLang, languageNudge, type Lang } from '../lib/lang.js';
import { deskPersonaNote, deskLeftNote, humanJoinedNote } from './deskPersona.js';

/**
 * Trial-safe phone bridge — Twilio trials strip <Dial><Sip>, so instead of streaming audio to the
 * Realtime model we run a turn loop: Twilio <Gather input="speech"> transcribes the caller, this runner
 * gives the text to the chat model with the SAME system prompt and the SAME handleTool() the web and
 * SIP paths use, and the reply goes back as <Say>. Same captions / SMS / registered / pattern events
 * reach the web page, and the human-handoff relay works the same way.
 */

export const END_MARK = '<END>';
export interface TurnResult { say: string; end: boolean }
export const REPROMPT = 'जी, मैं सुन रही हूँ। बोलिए।';
const FALLBACK = 'माफ़ कीजिए, एक पल — फिर से बताइए।';

const PHONE_TEXT_RULES = `
CHANNEL: PHONE CALL through a speech bridge. Your text is read aloud by a female Hindi/English voice named
Kajal (use feminine forms for yourself in Hindi: "बोल रही हूँ"). The caller's speech reaches you as a
transcript that may contain recognition errors — infer sensibly, and confirm numbers digit by digit.
- Write exactly what should be spoken: plain sentences only. No markdown, lists, emojis, brackets or stage directions.
- Write Hindi in Devanagari script (the voice reads it correctly) and English in English; mirror the caller.
- HARD CAP: at most three short sentences (about 35 words) per turn, then stop and wait for the caller. Never
  stack more than one question. Long turns feel like a lecture on the phone.
- Say numbers digit by digit with spaces ("9 8 1 2 5").
- There is no screen: never mention on-screen fields, toasts, typing or links. When you send the Aadhaar OTP,
  say it went to their registered mobile by SMS and ask them to read it out.
- Read the case number digit by digit, twice, and offer to email the documents.
- Silence: if the transcript is empty, ask again briefly — never end the call for silence alone.
- When the call is truly finished (case registered and the caller has nothing else, or they say goodbye),
  finish your reply with the token ${END_MARK}.
`.trim();

export class TurnRunner {
  static registry = new Map<string, TurnRunner>();

  private messages: ChatMsg[] = [];
  private transcript: { role: string; text: string; at: string }[] = [];
  private toolLog: unknown[] = [];
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private ended = false;
  private finalized = false;
  private handoffId: string | null = null;
  private humanName = 'the desk';
  private notes: string[] = [];
  private pending: Promise<TurnResult> | null = null;
  private waits = 0;
  private userLang: Lang = 'unknown';
  private deskAi = false;

  constructor(public session: VoiceSessionRow, public callSid: string | null, extraInstructions: string) {
    const sc = buildSessionConfig(`${extraInstructions}\n\n${PHONE_TEXT_RULES}`);
    this.messages.push({ role: 'system', content: String(sc.instructions) });
  }

  static for(sessionId: string): TurnRunner | undefined {
    return TurnRunner.registry.get(sessionId);
  }

  start(): void {
    TurnRunner.registry.set(this.session.id, this);
    this.capTimer = setTimeout(() => { void this.end('cap'); }, config.maxSessionMinutes * 60_000);
    this.touch();
    this.emit('call_status', { status: 'in_progress' });
    console.log(`[phone/twiml] start session=${this.session.id.slice(0, 8)} call=${this.callSid ?? '-'}`);
  }

  /** The fixed opening line (spoken by TwiML directly, no model round-trip). */
  greet(text: string): void {
    this.messages.push({ role: 'assistant', content: text });
    void this.record('assistant', text);
  }

  /** One caller turn. Empty text = silence. Resolves with what to say next. */
  turn(userText: string): Promise<TurnResult> {
    this.waits = 0;
    this.pending = this.runTurn(userText).catch((err) => {
      console.warn('[phone/twiml] turn failed:', (err as Error).message);
      return { say: FALLBACK, end: false };
    });
    return this.pending;
  }

  /** Wait up to `ms` for the running turn; null = still working (caller hears a filler and we get polled again). */
  async waitPending(ms: number): Promise<TurnResult | null> {
    if (!this.pending) return { say: REPROMPT, end: false };
    const p = this.pending;
    const r = await Promise.race<TurnResult | null>([p, new Promise<null>((ok) => setTimeout(() => ok(null), ms))]);
    if (r) { if (this.pending === p) this.pending = null; return r; }
    this.waits += 1;
    return null;
  }
  get waitCount(): number { return this.waits; }

  private async runTurn(userText: string): Promise<TurnResult> {
    this.touch();
    if (userText) {
      this.userLang = updateLang(this.userLang, userText);
      this.messages.push({ role: 'user', content: userText });
      await this.record('user', userText);
    } else if (!this.notes.length) {
      return { say: REPROMPT, end: false };
    }
    for (const n of this.notes.splice(0)) this.messages.push({ role: 'user', content: n });
    if (!userText) this.messages.push({ role: 'user', content: '[The caller is quiet. Say what is pending above, or ask again briefly.]' });

    for (let hop = 0; hop < 6; hop++) {
      const r = await chatWithTools(this.messages);
      if (!r) return { say: FALLBACK, end: false };
      if (r.toolCalls.length) {
        this.messages.push({ role: 'assistant', content: r.content || null, tool_calls: r.toolCalls });
        for (const call of r.toolCalls) {
          const output = await this.runTool(call.function.name, call.function.arguments);
          this.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) });
        }
        continue;
      }
      const end = r.content.includes(END_MARK);
      const say = r.content.replace(END_MARK, '').replace(/\s+/g, ' ').trim() || FALLBACK;
      this.messages.push({ role: 'assistant', content: say });
      await this.record('assistant', say);
      const nudge = languageNudge(this.userLang, detectLang(say));
      if (nudge) this.messages.push({ role: 'system', content: nudge });
      return { say, end };
    }
    return { say: FALLBACK, end: false };
  }

  private async runTool(name: string, rawArgs: string): Promise<Record<string, unknown>> {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(rawArgs || '{}'); } catch { /* empty */ }
    const started = Date.now();
    let output: Record<string, unknown>;
    let ok = true;
    this.emit('tool', { name });
    try {
      output = await handleTool(name, args, { session: this.session });
    } catch (err) {
      ok = false;
      output = err instanceof ToolError
        ? { error: { code: err.code, message: err.message } }
        : { error: { code: 'internal', message: 'Tool failed — apologise and retry once.' } };
    }
    this.toolLog.push(redactDeep({ name, args, ok, ms: Date.now() - started, at: new Date().toISOString() }));
    console.log(`[tool] session=${this.session.id.slice(0, 8)} channel=phone/twiml tool=${name} ms=${Date.now() - started} ok=${ok}`);
    if (ok) {
      if (output.toast) this.emit('sms', output.toast);
      if (name === 'register_case' && output.registered) this.emit('registered', { case_number: output.case_number, case_token: output.case_token });
      if (name === 'find_similar_cases' && output.count_30d !== undefined) this.emit('pattern', output);
    }
    return output;
  }

  private async record(role: 'user' | 'assistant', text: string): Promise<void> {
    this.transcript.push({ role, text, at: new Date().toISOString() });
    this.emit('caption', { id: `${role}-${Date.now()}`, role, text, final: true });
    if (this.handoffId) await this.postHandoffMessage(role === 'user' ? 'citizen' : 'agent', text);
  }

  private emit(event: string, payload: unknown): void {
    void broadcast(`session:${this.session.id}`, event, payload);
  }

  // ── human handoff relay: notes are spoken on the caller's next turn (Gather polls every few seconds) ──
  setHandoff(id: string | null): void { this.handoffId = id; }
  announceHuman(name: string, kind: 'ai' | 'human' = 'human'): void {
    this.humanName = name;
    this.deskAi = kind === 'ai';
    this.notes.push(kind === 'ai' ? deskPersonaNote(name) : humanJoinedNote(name, 'phone'));
  }
  relayHuman(text: string, name = this.humanName): void {
    this.notes.push(`[OPERATOR ${name} SAYS — say this to the caller in their language, faithfully and warmly, then wait]: ${text}`);
  }
  humanLeft(deskName?: string): void {
    this.deskAi = false;
    this.notes.push(deskName ? deskLeftNote(deskName) : `[Operator ${this.humanName} has left the conversation. Thank the caller briefly and continue the intake from where it stopped.]`);
  }
  /** The desk persona gets its own voice on the phone loop. */
  get ttsVoice(): string { return this.deskAi ? config.phoneTtsVoiceDesk : config.phoneTtsVoice; }
  private async postHandoffMessage(sender: 'citizen' | 'agent', text: string): Promise<void> {
    if (!this.handoffId) return;
    const [row] = await db.insert(handoffMessages).values({ handoffId: this.handoffId, sender, text: redact(text) }).returning();
    void broadcast(`handoff:${this.handoffId}`, 'message', { id: row.id, sender, text: row.text, at: row.createdAt });
  }

  private touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    // no status callback on a trial: if Twilio stops polling us the caller has hung up
    this.idleTimer = setTimeout(() => { void this.finalize('idle'); }, 120_000);
  }

  async end(reason: string): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    console.log(`[phone/twiml] end (${reason}) session=${this.session.id.slice(0, 8)}`);
    if (reason === 'cap' && this.callSid) await twilioHangup(this.callSid);
    await this.finalize(reason);
  }

  private async finalize(reason: string): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    if (this.capTimer) clearTimeout(this.capTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    TurnRunner.registry.delete(this.session.id);
    const minutes = Math.round(((Date.now() - new Date(this.session.startedAt).getTime()) / 60_000) * 100) / 100;
    await db.update(voiceSessions).set({
      endedAt: new Date(), minutes: String(minutes), callStatus: 'completed',
      transcript: this.transcript.map((t) => ({ ...t, text: redact(t.text) })),
      toolCalls: this.toolLog.slice(-200),
      phoneE164: null,
    }).where(eq(voiceSessions.id, this.session.id));
    this.emit('call_status', { status: 'completed', reason, minutes });
  }
}

/** Whichever bridge is driving this phone session (SIP runner or TwiML turn runner). */
export function phoneRunnerFor(sessionId: string): PhoneRunner | TurnRunner | undefined {
  return PhoneRunner.for(sessionId) ?? TurnRunner.for(sessionId);
}
