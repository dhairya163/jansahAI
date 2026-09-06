import WebSocket from 'ws';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { voiceSessions, handoffMessages, type VoiceSessionRow } from '../db/schema.js';
import { config } from '../config.js';
import { realtimeCallWsUrl, hangupSipCall } from './realtime.js';
import { handleTool, ToolError } from './toolHandlers.js';
import { broadcast } from '../lib/supabase.js';
import { redact, redactDeep } from '../lib/redact.js';
import { detectLang, updateLang, languageNudge, type Lang } from '../lib/lang.js';

/**
 * Phone session runner — does for a SIP call what the browser does for a WebRTC call:
 * drives the OpenAI Realtime session over WebSocket, executes the model's tool calls
 * through the SAME handleTool() the web uses, streams captions to the web page
 * (session:{id} channel) and relays human-operator messages during a handoff.
 */
export class PhoneRunner {
  static registry = new Map<string, PhoneRunner>();

  private ws: WebSocket | null = null;
  private transcript: { role: string; text: string; at: string }[] = [];
  private toolLog: unknown[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ended = false;
  private finalized = false;
  private handoffId: string | null = null;
  private humanName = 'the desk';
  private userLang: Lang = 'unknown';

  constructor(public session: VoiceSessionRow, public callId: string, private greeting: string) {}

  static for(sessionId: string): PhoneRunner | undefined {
    return PhoneRunner.registry.get(sessionId);
  }

  start(): void {
    PhoneRunner.registry.set(this.session.id, this);
    const ws = new WebSocket(realtimeCallWsUrl(this.callId), {
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    });
    this.ws = ws;
    ws.on('open', () => {
      console.log(`[phone] ws open session=${this.session.id.slice(0, 8)} call=${this.callId.slice(0, 12)}`);
      this.send({ type: 'response.create', response: { instructions: this.greeting } });
      this.timer = setTimeout(() => { void this.end('cap'); }, config.maxSessionMinutes * 60_000);
      this.emit('call_status', { status: 'in_progress' });
    });
    ws.on('message', (data) => { void this.handle(data.toString()); });
    ws.on('close', () => { void this.finalize('ws_closed'); });
    ws.on('error', (err) => { console.warn('[phone ws]', err.message); });
  }

  private send(obj: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private emit(event: string, payload: unknown): void {
    void broadcast(`session:${this.session.id}`, event, payload);
  }

  private async handle(raw: string): Promise<void> {
    let e: Record<string, unknown>;
    try { e = JSON.parse(raw); } catch { return; }
    const type = String(e.type ?? '');

    if (type === 'response.output_audio_transcript.done') {
      const text = String(e.transcript ?? '');
      if (!text.trim()) return;
      this.transcript.push({ role: 'assistant', text, at: new Date().toISOString() });
      this.emit('caption', { id: String(e.item_id ?? Date.now()), role: 'assistant', text, final: true });
      if (this.handoffId) await this.postHandoffMessage('agent', text);
      const nudge = languageNudge(this.userLang, detectLang(text));
      if (nudge) this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: nudge }] } });
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const text = String(e.transcript ?? '');
      if (!text.trim()) return;
      this.transcript.push({ role: 'user', text, at: new Date().toISOString() });
      this.userLang = updateLang(this.userLang, text);
      this.emit('caption', { id: String(e.item_id ?? Date.now()), role: 'user', text, final: true });
      if (this.handoffId) await this.postHandoffMessage('citizen', text);
      return;
    }
    if (type === 'response.function_call_arguments.done') {
      const name = String(e.name ?? '');
      const callId = String(e.call_id ?? '');
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(String(e.arguments ?? '{}')); } catch { /* empty */ }
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
      console.log(`[tool] session=${this.session.id.slice(0, 8)} channel=phone tool=${name} ms=${Date.now() - started} ok=${ok}`);
      if (ok) {
        if (output.toast) this.emit('sms', output.toast);
        if (name === 'register_case' && output.registered) {
          this.emit('registered', { case_number: output.case_number, case_token: output.case_token });
        }
        if (name === 'find_similar_cases' && output.count_30d !== undefined) this.emit('pattern', output);
      }
      this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) } });
      this.send({ type: 'response.create' });
      return;
    }
    if (type === 'error') console.warn('[phone realtime error]', JSON.stringify(e.error ?? e).slice(0, 300));
  }

  // ── human handoff relay (operator types on the platform; the agent speaks it) ──
  setHandoff(id: string | null): void { this.handoffId = id; }

  announceHuman(name: string): void {
    this.humanName = name;
    this.inject(`[A human operator named ${name} has joined from the Jansah desk. Tell the caller, in their language, that ${name} is now with them and will speak through you. From now on: relay each operator message faithfully, then wait for the caller's reply. Ask no new intake questions of your own until the operator leaves.]`);
  }

  relayHuman(text: string, name = this.humanName): void {
    this.inject(`[OPERATOR ${name} SAYS — say this to the caller in their language, faithfully and warmly, then wait]: ${text}`);
  }

  humanLeft(): void {
    this.inject(`[Operator ${this.humanName} has left the conversation. Thank the caller briefly and continue the intake from where it stopped.]`);
  }

  private inject(text: string): void {
    this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
    this.send({ type: 'response.create' });
  }

  private async postHandoffMessage(sender: 'citizen' | 'agent', text: string): Promise<void> {
    if (!this.handoffId) return;
    const [row] = await db.insert(handoffMessages).values({ handoffId: this.handoffId, sender, text: redact(text) }).returning();
    void broadcast(`handoff:${this.handoffId}`, 'message', { id: row.id, sender, text: row.text, at: row.createdAt });
  }

  async end(reason: string): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    console.log(`[phone] end (${reason}) session=${this.session.id.slice(0, 8)}`);
    await hangupSipCall(this.callId);
    this.ws?.close();
    await this.finalize(reason);
  }

  private async finalize(reason: string): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    if (this.timer) clearTimeout(this.timer);
    PhoneRunner.registry.delete(this.session.id);
    const minutes = Math.round(((Date.now() - new Date(this.session.startedAt).getTime()) / 60_000) * 100) / 100;
    await db.update(voiceSessions).set({
      endedAt: new Date(), minutes: String(minutes), callStatus: 'completed',
      transcript: this.transcript.map((t) => ({ ...t, text: redact(t.text) })),
      toolCalls: this.toolLog.slice(-200),
      phoneE164: null,                                   // number kept only for the call itself
    }).where(eq(voiceSessions.id, this.session.id));
    this.emit('call_status', { status: 'completed', reason, minutes });
  }
}
