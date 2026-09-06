/** Script / language detection for the "reply in the caller's language" guard. */
const HINGLISH = /\b(hai|hain|nahi|nahin|mera|meri|mere|kya|kaise|kab|kyun|kar|karo|kiya|hua|hui|tha|thi|the|mujhe|aap|aapka|aapke|aapki|paise|paisa|rupaye|bhai|ji|haan|theek|thik|bata|batao|bataiye|abhi|kal|aaj|wala|wali|gaya|gayi|liya|diya|chahiye|bolo|boliye|liye|phir|hum|kripya|dhanyavaad|shukriya|sahi|galat|mil|mila|kaun|kahan|matlab|samajh|toh|bilkul|zaroor|zaroori|dijiye|kijiye)\b/gi;
export type Lang = "hi" | "hinglish" | "indic" | "en" | "unknown";

export function detectLang(text: string): Lang {
  const t = text.trim();
  if (!t) return "unknown";
  if (/[ऀ-ॿ]/.test(t)) return "hi";                 // Devanagari
  if (/[ঀ-ൿ]/.test(t)) return "indic";              // Bengali … Malayalam blocks
  const words = t.split(/\s+/).length;
  const hits = (t.match(HINGLISH) ?? []).length;
  if (hits >= 2 && hits / words >= 0.12) return "hinglish";
  return /[a-z]/i.test(t) ? "en" : "unknown";
}

/** Carry the last known language across number-only / empty utterances. */
export function updateLang(prev: Lang, text: string): Lang {
  const l = detectLang(text);
  return l === "unknown" ? prev : l;
}

/** A system-side correction when the caller speaks an Indian language and the model answered in English. */
export function languageNudge(userLang: Lang, assistantLang: Lang): string | null {
  if (assistantLang !== "en") return null;
  if (userLang === "hi" || userLang === "hinglish") {
    return "[LANGUAGE CHECK: the caller is speaking Hindi but your last reply was in English. From now on reply ONLY in Hindi (natural spoken Hinglish is fine) — every sentence, including short acknowledgements and anything you say around a tool call.]";
  }
  if (userLang === "indic") {
    return "[LANGUAGE CHECK: the caller is speaking an Indian language but your last reply was in English. From now on reply only in the caller's language, including short acknowledgements.]";
  }
  return null;
}
