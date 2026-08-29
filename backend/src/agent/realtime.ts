import { config } from '../config.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { TOOLS } from './toolsSchema.js';

/**
 * ALL OpenAI touchpoints live in this one file (AGENTS.md rule; API surface drifts).
 * GA Realtime API (verified 2026-08):
 *   - mint:   POST https://api.openai.com/v1/realtime/client_secrets
 *   - webrtc: client POSTs SDP offer to https://api.openai.com/v1/realtime/calls (Bearer ephemeral)
 */

export interface MintedSecret {
  value: string;
  expires_at: number;
}

/**
 * Caption-script steering: Hindi and Urdu are near-identical phonetically, so the
 * transcriber sometimes emits Urdu (Arabic) script for Hindi speech. A Devanagari-
 * heavy prompt biases the ASR toward Devanagari/Latin output without forcing a language.
 */
const TRANSCRIBE_PROMPT =
  'भारत में साइबर-अपराध शिकायत की बातचीत। हिंदी को हमेशा देवनागरी में लिखें, कभी उर्दू/अरबी लिपि में नहीं। ' +
  'Hinglish stays in Latin script; English stays English. Expect Hindi, English, Hinglish, ' +
  'Kannada, Tamil, Telugu, Bengali, Punjabi, Marathi. Terms: UPI, OTP, Aadhaar, FIR, lakh, crore, paisa, ₹.';

export async function mintClientSecret(): Promise<MintedSecret> {
  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: Math.min(config.maxSessionMinutes * 60, 7200) },
      session: {
        type: 'realtime',
        model: config.realtimeModel,
        instructions: `${SYSTEM_PROMPT}\n\nCURRENT DATE & TIME (IST): ${new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(new Date())}. When the caller says "abhi / just now / aaj", set incident_at yourself from this clock — never ask them for the date or time of day if they already told you it just happened.`,
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
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`client_secrets ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as { value: string; expires_at: number };
  return { value: data.value, expires_at: data.expires_at };
}

/** Text-model completion (translation/letter-filling). Never called from voice tool handlers (§18.3). */
export async function chatComplete(system: string, user: string, temperature = 0.2): Promise<string | null> {
  // gpt-5/o-series reasoning models reject custom temperature; keep them fast with minimal effort
  const isReasoning = /^(gpt-5|o\d)/.test(config.textModel);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.textModel,
      ...(isReasoning ? { reasoning_effort: 'minimal' } : { temperature }),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    console.warn(`[chatComplete] ${config.textModel} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

/** Client-side constants the frontend needs to open the WebRTC call. */
export const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
