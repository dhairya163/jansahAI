/** Script / language detection for the "reply in the caller's language" guard. */
const HINGLISH = /\b(hai|hain|nahi|nahin|mera|meri|mere|kya|kaise|kab|kyun|kar|karo|kiya|hua|hui|tha|thi|the|mujhe|aap|aapka|aapke|aapki|paise|paisa|rupaye|bhai|ji|haan|theek|thik|bata|batao|bataiye|abhi|kal|aaj|wala|wali|gaya|gayi|liya|diya|chahiye|bolo|boliye|liye|phir|hum|kripya|dhanyavaad|shukriya|sahi|galat|mil|mila|kaun|kahan|matlab|samajh|toh|bilkul|zaroor|zaroori|dijiye|kijiye)\b/gi;
/** English words as ASR sometimes writes them in Devanagari — a caption made mostly of these is English speech. */
const EN_IN_DEVANAGARI = new Set(["येस","यस","नो","ओके","ओक","थैंक","थैंक्स","थैंक्यू","थैंक्यु","हेलो","हैलो","हाय","गॉट","इट","प्लीज","प्लीज़","सॉरी","वन","टू","थ्री","फोर","फाइव","सिक्स","सेवन","एट","नाइन","टेन","ज़ीरो","जीरो","इलेवन","ट्वेल्व","माय","नेम","इज","इज़","आई","एम","यू","द","दिस","दैट","व्हाट","हैपन्ड","फ्रॉड","मनी","कैन","हेल्प","वांट","टॉक","ह्यूमन","पर्सन","रियल","स्टोलन","लॉस्ट","हैव","विद","फ्रॉम","सम","समवन","कॉल्ड","सेड","लाइक","सो","बट","एंड","ऑफ","इन","ऑन","फॉर","अबाउट","अगेन","ओनली","रुपीज","लैक","लाख","अमाउंट","अकाउंट","बैंक","ट्रांजेक्शन","पेमेंट","सर","मैम","मैडम","एब्सोल्यूटली","करेक्ट","फाइन","ओकेज","राइट","रियली","जस्ट","नाउ","टुडे","यस्टरडे","नाइट","इवनिंग","मॉर्निंग","हियर","देयर","इट्स","आईटी","वी","दे","देम","हिम","हर","हिज","हिस","शी","ही"]);
export type Lang = "hi" | "hinglish" | "indic" | "en" | "unknown";

export function detectLang(text: string): Lang {
  const t = text.trim();
  if (!t) return "unknown";
  if (/[ऀ-ॿ]/.test(t)) {                           // Devanagari — unless it is English merely transliterated ("येस", "थैंक यू")
    const toks = t.split(/[\s,.!?।]+/).filter(Boolean);
    const en = toks.filter((w) => EN_IN_DEVANAGARI.has(w)).length;
    return toks.length >= 1 && en >= 1 && en / toks.length >= 0.5 ? "en" : "hi";
  }
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
