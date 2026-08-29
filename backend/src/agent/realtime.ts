import { createHash } from 'node:crypto';

import { config } from '../config.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';

export function voiceCapability() {
  return { enabled: Boolean(config.openaiApiKey), model: config.realtimeModel, voice: config.realtimeVoice, maxMinutes: config.maxSessionMinutes, transport: 'webrtc-unified' };
}

export async function createRealtimeCall(sdp: string, safetySeed: string) {
  if (!config.openaiApiKey) throw Object.assign(new Error('Voice API is not configured yet. Use the guided typed intake.'), { statusCode: 503 });
  const session = JSON.stringify({
    type: 'realtime', model: config.realtimeModel, output_modalities: ['audio'], instructions: SYSTEM_PROMPT,
    audio: {
      input: {
        transcription: { model: config.transcriptionModel },
        turn_detection: { type: 'server_vad', create_response: false, interrupt_response: false },
      },
      output: { voice: config.realtimeVoice },
    },
  });
  const form = new FormData(); form.set('sdp', sdp); form.set('session', session);
  const response = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST', headers: { Authorization: `Bearer ${config.openaiApiKey}`, 'OpenAI-Safety-Identifier': createHash('sha256').update(safetySeed).digest('hex') }, body: form,
  });
  const answer = await response.text();
  if (!response.ok) throw Object.assign(new Error(`OpenAI Realtime rejected the call: ${answer}`), { statusCode: response.status });
  return answer;
}
