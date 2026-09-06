import crypto from 'node:crypto';
import { config } from '../config.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { TOOLS } from './toolsSchema.js';

/**
 * ALL OpenAI touchpoints live in this one file (AGENTS.md rule; API surface drifts).
 * GA Realtime API (verified 2026-09):
 *   - browser: POST /v1/realtime/client_secrets → WebRTC SDP to /v1/realtime/calls
 *   - phone (SIP): webhook realtime.call.incoming → POST /v1/realtime/calls/{id}/accept
 *                  → control over wss://api.openai.com/v1/realtime?call_id={id}
 *   - text: /v1/chat/completions · embeddings: /v1/embeddings
 */

const OA = 'https://api.openai.com/v1';
const authHeaders = () => ({ Authorization: `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' });

export const REALTIME_CALLS_URL = `${OA}/realtime/calls`;
export const realtimeCallWsUrl = (callId: string) => `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`;
export const sipUri = () => `sip:${config.openaiProjectId}@sip.api.openai.com;transport=tls`;

/**
 * Caption-script steering: Hindi and Urdu are near-identical phonetically, so the
 * transcriber sometimes emits Urdu (Arabic) script for Hindi speech. A Devanagari-
 * heavy prompt biases the ASR toward Devanagari/Latin output without forcing a language.
 */
const TRANSCRIBE_PROMPT =
  'भारत में साइबर-अपराध शिकायत की बातचीत। हिंदी को हमेशा देवनागरी में लिखें, कभी उर्दू/अरबी लिपि में नहीं। ' +
  'Hinglish stays in Latin script; English stays English. Expect Hindi, English, Hinglish, ' +
  'Kannada, Tamil, Telugu, Bengali, Punjabi, Marathi. Terms: UPI, OTP, Aadhaar, FIR, lakh, crore, paisa, ₹.';

function nowIST(): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date());
}

/** One session config for every channel (browser + phone) — same prompt, same 13 tools. */
export function buildSessionConfig(extraInstructions = ''): Record<string, unknown> {
  return {
    type: 'realtime',
    model: config.realtimeModel,
    instructions:
      `${SYSTEM_PROMPT}\n\nCURRENT DATE & TIME (IST): ${nowIST()}. When the caller says "abhi / just now / aaj", set incident_at yourself from this clock — never ask them for the date or time of day if they already told you it just happened.` +
      (extraInstructions ? `\n\n${extraInstructions}` : ''),
    tools: TOOLS,
    tool_choice: 'auto',
    output_modalities: ['audio'],
    audio: {
      input: {
        transcription: {
          model: config.transcribeModel,
          prompt: config.transcribePrompt || TRANSCRIBE_PROMPT,
          ...(config.transcribeLanguage ? { language: config.transcribeLanguage } : {}),
        },
        noise_reduction: { type: 'near_field' },
        turn_detection: {                          // barge-in on (ADR: §18.1)
          type: 'server_vad',
          threshold: config.vadThreshold,          // < 0.5 default = more sensitive mic pickup
          prefix_padding_ms: config.vadPrefixMs,
          silence_duration_ms: config.vadSilenceMs,
        },
      },
      output: { voice: config.realtimeVoice },
    },
  };
}

export interface MintedSecret { value: string; expires_at: number }

export async function mintClientSecret(): Promise<MintedSecret> {
  const res = await fetch(`${OA}/realtime/client_secrets`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: Math.min(config.maxSessionMinutes * 60, 7200) },
      session: buildSessionConfig(),
    }),
  });
  if (!res.ok) throw new Error(`client_secrets ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = (await res.json()) as { value: string; expires_at: number };
  return { value: data.value, expires_at: data.expires_at };
}

/** SIP: accept an incoming call with our session config. */
export async function acceptSipCall(callId: string, extraInstructions = ''): Promise<void> {
  const res = await fetch(`${OA}/realtime/calls/${encodeURIComponent(callId)}/accept`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(buildSessionConfig(extraInstructions)),
  });
  if (!res.ok) throw new Error(`accept ${res.status}: ${(await res.text()).slice(0, 400)}`);
}

export async function hangupSipCall(callId: string): Promise<void> {
  await fetch(`${OA}/realtime/calls/${encodeURIComponent(callId)}/hangup`, { method: 'POST', headers: authHeaders() }).catch(() => undefined);
}

export async function rejectSipCall(callId: string, statusCode = 486): Promise<void> {
  await fetch(`${OA}/realtime/calls/${encodeURIComponent(callId)}/reject`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ status_code: statusCode }),
  }).catch(() => undefined);
}

/** Standard-Webhooks signature check for OpenAI webhooks (webhook-id / -timestamp / -signature). */
export function verifyOpenAIWebhook(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>): boolean {
  const secret = config.openaiWebhookSecret;
  if (!secret) return false;
  const h = (k: string) => { const v = headers[k]; return Array.isArray(v) ? v[0] : v; };
  const id = h('webhook-id'); const ts = h('webhook-timestamp'); const sigs = h('webhook-signature');
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${rawBody.toString()}`).digest('base64');
  return sigs.split(' ').some((part) => {
    const [, sig] = part.split(',');
    if (!sig) return false;
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

/** Text-model completion (translation/letter-filling/briefs). Never called from voice tool handlers (§18.3). */
export async function chatComplete(system: string, user: string, temperature = 0.2, model = config.textModel): Promise<string | null> {
  const isReasoning = /^(gpt-5|o\d)/.test(model);
  const res = await fetch(`${OA}/chat/completions`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({
      model,
      ...(isReasoning ? { reasoning_effort: 'minimal' } : { temperature }),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) { console.warn(`[chatComplete] ${model} → ${res.status}: ${(await res.text()).slice(0, 200)}`); return null; }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

/** JSON-mode completion helper (radar signatures, briefs, handoff summaries). */
export async function chatJson<T>(system: string, user: string, model = config.radarModel): Promise<T | null> {
  const isReasoning = /^(gpt-5|o\d)/.test(model);
  const res = await fetch(`${OA}/chat/completions`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({
      model,
      ...(isReasoning ? { reasoning_effort: 'minimal' } : { temperature: 0.1 }),
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) { console.warn(`[chatJson] ${model} → ${res.status}: ${(await res.text()).slice(0, 200)}`); return null; }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  try { return JSON.parse(data.choices?.[0]?.message?.content ?? 'null') as T; } catch { return null; }
}

export async function embedText(text: string): Promise<number[] | null> {
  const res = await fetch(`${OA}/embeddings`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ model: config.embeddingModel, input: text.slice(0, 4000) }),
  });
  if (!res.ok) { console.warn(`[embed] ${res.status}`); return null; }
  const data = (await res.json()) as { data?: { embedding: number[] }[] };
  return data.data?.[0]?.embedding ?? null;
}
