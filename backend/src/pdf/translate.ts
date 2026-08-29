import { chatComplete } from '../agent/realtime.js';

/**
 * Free-text translation for artifact bodies (§21). Goes through the single OpenAI
 * touchpoint file (src/agent/realtime.ts). Never used inside voice tool handlers (§18.3).
 */
export async function translateToEnglish(text: string, sourceLanguage: string | null): Promise<string | null> {
  if (!text || !text.trim()) return null;
  if (!sourceLanguage || sourceLanguage === 'en') return null;
  try {
    return await chatComplete(
      'You translate citizen crime-complaint narratives into clear, formal English for an official record. ' +
      'Translate faithfully; do not add, infer, or embellish facts. Keep all names, numbers, identifiers, and amounts exactly as given. ' +
      'Write in first person. Output only the translation.',
      text,
    );
  } catch (err) {
    console.warn('[translate] failed:', (err as Error).message);
    return null;
  }
}
