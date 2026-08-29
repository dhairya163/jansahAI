import { GUIDANCE_EN, type GuidanceString } from './en.js';
import { GUIDANCE_HI } from './hi.js';

export type { GuidanceString };
export { GUIDANCE_EN, GUIDANCE_HI };

export interface GuidanceEntry { key: string; en: GuidanceString; hi: GuidanceString }

export function getGuidance(key: string): GuidanceEntry | null {
  const en = GUIDANCE_EN[key];
  if (!en) return null;
  return { key, en, hi: GUIDANCE_HI[key] ?? en };
}

export function getGuidanceList(keys: readonly string[]): GuidanceEntry[] {
  return keys.map((k) => getGuidance(k)).filter((g): g is GuidanceEntry => g !== null);
}

/** ezero_fir has a dynamic threshold line (§17.4). */
export function ezeroDynamicLine(amountLost: number | null): { en: string; hi: string } {
  if (amountLost !== null && amountLost >= 1_000_000) {
    return {
      en: 'Your reported loss is above that threshold — an automatic Zero FIR applies to a complaint like yours on the real system.',
      hi: 'आपका बताया नुकसान इस सीमा से ऊपर है — असली व्यवस्था में ऐसी शिकायत पर ज़ीरो FIR अपने आप दर्ज होती है।',
    };
  }
  return {
    en: 'Your reported loss is below that threshold, so FIR registration must be pushed manually — this system prepares those documents for you on time.',
    hi: 'आपका बताया नुकसान इस सीमा से नीचे है, इसलिए FIR के लिए खुद कदम उठाने होते हैं — यह सिस्टम वे दस्तावेज़ समय पर आपके लिए तैयार करता है।',
  };
}
