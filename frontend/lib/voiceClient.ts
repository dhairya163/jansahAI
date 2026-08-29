'use client';
import { createVoiceSession, endVoiceSession, callTool, type SessionInfo } from './api';

/**
 * Browser ↔ OpenAI Realtime over WebRTC (ADR-1). The model's tool calls arrive on the
 * data channel and are relayed to the backend (§13): browser is untrusted transport only.
 */

export type VoiceState = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

export interface CaptionLine { id: string; role: 'user' | 'assistant'; text: string; final: boolean }

export interface VoiceCallbacks {
  onState: (s: VoiceState, detail?: string) => void;
  onCaption: (line: CaptionLine) => void;
  onToolCall: (name: string) => void;
  onToolResult: (name: string, result: Record<string, unknown>, isError: boolean, args: Record<string, unknown>) => void;
  onTimer: (secondsLeft: number) => void;
}

export class VoiceClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private session: SessionInfo | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private secondsLeft = 0;
  private transcript: { role: string; text: string; at: string }[] = [];
  private userPartials = new Map<string, string>();
  private assistantPartials = new Map<string, string>();
  private endedByUs = false;

  constructor(private cb: VoiceCallbacks) {}

  get sessionToken(): string | null { return this.session?.session_token ?? null; }
  get sessionId(): string | null { return this.session?.session_id ?? null; }

  async start(): Promise<void> {
    this.cb.onState('connecting');
    try {
      this.session = await createVoiceSession();
    } catch (err) {
      this.cb.onState('error', (err as Error).message);
      return;
    }
    try {
      const pc = new RTCPeerConnection();
      this.pc = pc;

      this.audioEl = document.createElement('audio');
      this.audioEl.autoplay = true;
      pc.ontrack = (e) => { if (this.audioEl) this.audioEl.srcObject = e.streams[0]; };

      this.mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of this.mic.getTracks()) pc.addTrack(track, this.mic);

      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.onmessage = (e) => { void this.handleEvent(e.data as string); };
      dc.onopen = () => {
        this.cb.onState('live');
        this.startTimer();
      };

      pc.onconnectionstatechange = () => {
        if ((pc.connectionState === 'failed' || pc.connectionState === 'disconnected') && !this.endedByUs) {
          this.cb.onState('error', 'connection lost — you can restart the call or continue by typing on Track');
          this.cleanup();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch(this.session.calls_url, {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${this.session.client_secret}`, 'Content-Type': 'application/sdp' },
      });
      if (!sdpResponse.ok) throw new Error(`SDP exchange failed (${sdpResponse.status})`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() });
    } catch (err) {
      const msg = (err as Error).name === 'NotAllowedError'
        ? 'mic-denied'
        : (err as Error).message;
      this.cb.onState('error', msg);
      this.cleanup();
    }
  }

  private startTimer(): void {
    this.secondsLeft = (this.session?.max_minutes ?? 10) * 60;
    this.cb.onTimer(this.secondsLeft);
    this.timerId = setInterval(() => {
      this.secondsLeft -= 1;
      this.cb.onTimer(this.secondsLeft);
      if (this.secondsLeft <= 0) void this.end();   // §18.1 hard cap (cost guard)
    }, 1000);
  }

  private send(obj: unknown): void {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(obj));
  }

  /** Type-instead panel → announced to the model as a user message (§12.2). */
  typeText(label: string, value: string): void {
    const text = `[user typed the ${label} on screen]: ${value}`;
    this.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    });
    this.send({ type: 'response.create' });
    this.pushTranscript('user', text);
    this.cb.onCaption({ id: `typed-${Date.now()}`, role: 'user', text, final: true });
  }

  private pushTranscript(role: string, text: string): void {
    if (text.trim()) this.transcript.push({ role, text, at: new Date().toISOString() });
  }

  private async handleEvent(raw: string): Promise<void> {
    let e: Record<string, unknown>;
    try { e = JSON.parse(raw); } catch { return; }
    const type = String(e.type ?? '');

    switch (type) {
      // assistant captions (GA event names)
      case 'response.output_audio_transcript.delta': {
        const id = String(e.item_id ?? e.response_id ?? 'a');
        const cur = (this.assistantPartials.get(id) ?? '') + String(e.delta ?? '');
        this.assistantPartials.set(id, cur);
        this.cb.onCaption({ id, role: 'assistant', text: cur, final: false });
        return;
      }
      case 'response.output_audio_transcript.done': {
        const id = String(e.item_id ?? e.response_id ?? 'a');
        const text = String(e.transcript ?? this.assistantPartials.get(id) ?? '');
        this.assistantPartials.delete(id);
        this.cb.onCaption({ id, role: 'assistant', text, final: true });
        this.pushTranscript('assistant', text);
        return;
      }
      // user captions
      case 'conversation.item.input_audio_transcription.delta': {
        const id = String(e.item_id ?? 'u');
        const cur = (this.userPartials.get(id) ?? '') + String(e.delta ?? '');
        this.userPartials.set(id, cur);
        this.cb.onCaption({ id, role: 'user', text: cur, final: false });
        return;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const id = String(e.item_id ?? 'u');
        const text = String(e.transcript ?? this.userPartials.get(id) ?? '');
        this.userPartials.delete(id);
        this.cb.onCaption({ id, role: 'user', text, final: true });
        this.pushTranscript('user', text);
        return;
      }
      // tool calls → relay to backend → return output → continue response
      case 'response.function_call_arguments.done': {
        const name = String(e.name ?? '');
        const callId = String(e.call_id ?? '');
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(String(e.arguments ?? '{}')); } catch { /* leave empty */ }
        this.cb.onToolCall(name);
        let output: Record<string, unknown>;
        let isError = false;
        try {
          const res = await callTool(this.session!.session_token, name, args);
          output = res.result;
        } catch (err) {
          isError = true;
          output = { error: (err as Error).message };
        }
        this.cb.onToolResult(name, output, isError, args);
        this.send({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
        });
        this.send({ type: 'response.create' });
        return;
      }
      case 'error':
        console.warn('[realtime error]', e);
        return;
      default:
        return;
    }
  }

  async end(): Promise<void> {
    if (this.endedByUs) return;
    this.endedByUs = true;
    const token = this.session?.session_token;
    this.cleanup();
    this.cb.onState('ended');
    if (token) {
      try { await endVoiceSession(token, this.transcript); } catch { /* best-effort */ }
    }
  }

  private cleanup(): void {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    this.dc?.close(); this.dc = null;
    this.pc?.close(); this.pc = null;
    this.mic?.getTracks().forEach((t) => t.stop()); this.mic = null;
    if (this.audioEl) { this.audioEl.srcObject = null; this.audioEl = null; }
  }
}
