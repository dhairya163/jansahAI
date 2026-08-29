import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import type { VoiceLanguage } from '../domain/types.js';
import { categoryLabels, playbooks } from '../engine/playbooks.js';
import { redactSensitive } from '../lib/redact.js';

const categories = Object.keys(playbooks) as [string, ...string[]];
const nullableString = z.string().nullable();

const slotShape = {
  narrative: nullableString,
  amount: z.number().nullable(),
  incident_at: nullableString,
  instrument: nullableString,
  txns: z.array(z.string()),
  payee_identifier: nullableString,
  own_bank: nullableString,
  suspect_contacts: z.array(z.string()),
  platforms: z.array(z.string()),
  urls: z.array(z.string()),
  first_seen_at: nullableString,
  suspect_handles: z.array(z.string()),
  account_id: nullableString,
  when_lost: nullableString,
  recovery_tried: nullableString,
  system_affected: nullableString,
  ransom_note: nullableString,
  when: nullableString,
  numbers: z.array(z.string()),
  message_samples: z.array(z.string()),
  caller_claims: nullableString,
  platform_name: nullableString,
  total_invested: z.number().nullable(),
  app_name: nullableString,
  wallet_addresses: z.array(z.string()),
  exchange: nullableString,
};

const extractionSchema = z.object({
  language: z.enum(['en', 'hi', 'hi-en']),
  language_confident: z.boolean(),
  category: z.enum(categories).nullable(),
  anonymous: z.boolean().nullable(),
  on_behalf_of: z.boolean().nullable(),
  reporter_name: nullableString,
  victim_name: nullableString,
  phone: nullableString,
  email: nullableString,
  confirmation: z.enum(['yes', 'no', 'unknown']),
  correction: z.boolean(),
  slots: z.object(slotShape),
});

export type IntakeExtraction = z.infer<typeof extractionSchema>;

export interface OrchestratorDraft {
  language: VoiceLanguage;
  category?: string;
  anonymous?: boolean;
  onBehalfOf?: boolean;
  slots: Record<string, unknown>;
  contact: Record<string, string>;
  awaitingConfirmation?: boolean;
  pendingField?: string;
}

type SpokenLanguage = Exclude<VoiceLanguage, 'und'>;

export function detectTurnLanguage(transcript: string, current: VoiceLanguage) {
  const devanagariCount = (transcript.match(/[\u0900-\u097f]/g) ?? []).length;
  if (devanagariCount >= 2) return { language: 'hi' as const, confident: true };

  const words = transcript.toLowerCase().match(/[a-z]+/g) ?? [];
  const hinglishWords = new Set(['aap', 'abhi', 'batao', 'bataiye', 'gaya', 'gayi', 'hai', 'hain', 'hua', 'kya', 'maine', 'mera', 'meri', 'mujhe', 'nahi', 'paise', 'tha', 'thi', 'the', 'ya']);
  if (words.filter((word) => hinglishWords.has(word)).length >= 2) return { language: 'hi-en' as const, confident: true };

  const identifierWords = new Set(['transaction', 'txn', 'reference', 'ref', 'id', 'ids', 'number', 'numbers', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'zero']);
  const contentWords = words.filter((word) => !identifierWords.has(word));
  if (contentWords.length >= 4) return { language: 'en' as const, confident: true };
  return { language: current === 'und' ? 'en' as const : current as SpokenLanguage, confident: false };
}

const arrays = new Set(['txns', 'suspect_contacts', 'platforms', 'urls', 'suspect_handles', 'numbers', 'message_samples', 'wallet_addresses']);
const jsonSlotProperties = Object.fromEntries(Object.keys(slotShape).map((key) => [key,
  arrays.has(key)
    ? { type: 'array', items: { type: 'string' } }
    : ['amount', 'total_invested'].includes(key)
      ? { type: ['number', 'null'] }
      : { type: ['string', 'null'] },
]));

const structuredOutputSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    language: { type: 'string', enum: ['en', 'hi', 'hi-en'] },
    language_confident: { type: 'boolean' },
    category: { enum: [...categories, null] },
    anonymous: { type: ['boolean', 'null'] },
    on_behalf_of: { type: ['boolean', 'null'] },
    reporter_name: { type: ['string', 'null'] },
    victim_name: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    confirmation: { type: 'string', enum: ['yes', 'no', 'unknown'] },
    correction: { type: 'boolean' },
    slots: { type: 'object', additionalProperties: false, properties: jsonSlotProperties, required: Object.keys(jsonSlotProperties) },
  },
  required: ['language', 'language_confident', 'category', 'anonymous', 'on_behalf_of', 'reporter_name', 'victim_name', 'phone', 'email', 'confirmation', 'correction', 'slots'],
};

const instructions = `You are a non-speaking intake-data extractor for an Indian cyber-complaint prototype.
Extract only facts stated or clearly implied by the latest citizen utterance. Never write a reply or question.

Language rules:
- language is en, hi (primarily Devanagari Hindi), or hi-en (Roman Hindi/Hinglish).
- language_confident must be false for identifiers, numbers, names, emails, URLs, transaction references, or very short generic answers such as yes/no. This preserves the established language.

State rules:
- Use current_draft to understand what the latest answer refers to.
- Return null or [] for facts not updated in this turn.
- narrative is a concise complete account. Update it only when substantive incident facts are added or corrected.
- txns contains transaction/reference IDs exactly as spoken.
- suspect_contacts contains suspect phone numbers, emails, handles, or payment IDs.
- confirmation is yes/no only when directly answering the final registration-confirmation question; otherwise unknown.
- correction is true only for an explicit correction.

Categories:
${categories.map((id) => `- ${id}: ${categoryLabels[id]}`).join('\n')}

Ignore passwords, OTPs, PINs, CVVs, full government IDs, card numbers, and authentication secrets. Never infer unstated facts.`;

function readOutputText(payload: Record<string, unknown>) {
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    for (const part of Array.isArray(content) ? content : []) {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
    }
  }
  return typeof payload.output_text === 'string' ? payload.output_text : '';
}

export async function extractIntakeTurn(transcript: string, draft: OrchestratorDraft, safetySeed: string) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': createHash('sha256').update(safetySeed).digest('hex'),
    },
    body: JSON.stringify({
      model: config.orchestratorModel,
      store: false,
      max_output_tokens: 900,
      instructions,
      input: JSON.stringify({
        current_draft: {
          language: draft.language, category: draft.category ?? null, anonymous: draft.anonymous ?? null,
          on_behalf_of: draft.onBehalfOf ?? null, slots: draft.slots, contact: draft.contact,
          awaiting_confirmation: Boolean(draft.awaitingConfirmation),
          pending_field: draft.pendingField ?? null,
        },
        latest_utterance: redactSensitive(transcript),
      }),
      text: { format: { type: 'json_schema', name: 'cyber_intake_turn', strict: true, schema: structuredOutputSchema } },
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Orchestrator request failed (${response.status}): ${JSON.stringify(payload)}`);
  const text = readOutputText(payload);
  if (!text) throw new Error('Orchestrator returned no structured output.');
  const extraction = extractionSchema.parse(JSON.parse(text));
  const detected = detectTurnLanguage(transcript, draft.language);
  if (detected.confident) {
    extraction.language = detected.language;
    extraction.language_confident = true;
  }
  return extraction;
}

function emptySlots(): IntakeExtraction['slots'] {
  return {
    narrative: null, amount: null, incident_at: null, instrument: null, txns: [], payee_identifier: null,
    own_bank: null, suspect_contacts: [], platforms: [], urls: [], first_seen_at: null, suspect_handles: [],
    account_id: null, when_lost: null, recovery_tried: null, system_affected: null, ransom_note: null,
    when: null, numbers: [], message_samples: [], caller_claims: null, platform_name: null,
    total_invested: null, app_name: null, wallet_addresses: [], exchange: null,
  };
}

export function fallbackExtraction(transcript: string, currentLanguage: VoiceLanguage): IntakeExtraction {
  const detected = detectTurnLanguage(transcript, currentLanguage);
  const slots = emptySlots();
  if (transcript.trim().split(/\s+/).length >= 5) slots.narrative = String(redactSensitive(transcript.trim()));
  return {
    language: detected.language,
    language_confident: detected.confident,
    category: null, anonymous: null, on_behalf_of: null, reporter_name: null, victim_name: null,
    phone: null, email: null, confirmation: 'unknown', correction: false, slots,
  };
}

export function resolveTurnLanguage(current: VoiceLanguage, extraction: IntakeExtraction): VoiceLanguage {
  return extraction.language_confident ? extraction.language : current;
}

function inferredInstrument(category?: string) {
  return ({ financial_upi: 'UPI', financial_card: 'card', financial_netbanking: 'net banking', financial_wallet: 'wallet', crypto_scam: 'cryptocurrency' } as Record<string, string>)[category ?? ''];
}

export function applyIntakeExtraction(draft: OrchestratorDraft, extraction: IntakeExtraction) {
  const saved: string[] = [];
  draft.language = resolveTurnLanguage(draft.language, extraction);
  if (extraction.category && extraction.category !== draft.category) { draft.category = extraction.category; saved.push('category'); }
  if (extraction.anonymous !== null) { draft.anonymous = extraction.anonymous; saved.push('anonymous'); }
  if (extraction.on_behalf_of !== null) { draft.onBehalfOf = extraction.on_behalf_of; saved.push('on_behalf_of'); }

  const contacts = { reporter_name: extraction.reporter_name, victim_name: extraction.victim_name, phone: extraction.phone, email: extraction.email };
  for (const [key, value] of Object.entries(contacts)) {
    if (value?.trim()) { draft.contact[key] = String(redactSensitive(value.trim())); saved.push(key); }
  }
  for (const [key, raw] of Object.entries(extraction.slots)) {
    if (arrays.has(key)) {
      const values = (raw as string[]).map((value) => redactSensitive(value.trim())).filter(Boolean);
      if (!values.length) continue;
      draft.slots[key] = key === 'txns' ? values.map((ref) => ({ ref })) : key === 'suspect_contacts' ? values.map((value) => ({ value })) : values;
      saved.push(key);
    } else if (raw !== null && raw !== '') {
      draft.slots[key] = typeof raw === 'string' ? redactSensitive(raw.trim()) : raw;
      saved.push(key);
    }
  }
  const instrument = inferredInstrument(draft.category);
  if (instrument && !draft.slots.instrument) { draft.slots.instrument = instrument; saved.push('instrument'); }
  if (saved.length || extraction.correction) draft.awaitingConfirmation = false;
  return [...new Set(saved)];
}

export function applyPendingAnswerFallback(extraction: IntakeExtraction, pendingField: string | undefined, transcript: string) {
  if (!pendingField || ['category', 'anonymous_choice', 'confirmation', 'correction'].includes(pendingField)) return false;
  if (/\b(switch|speak|continue|reply)\b.*\b(english|hindi|hinglish)\b/i.test(transcript)) return false;
  const value = transcript.trim();
  if (!value) return false;

  if (pendingField === 'reporter_name' && !extraction.reporter_name) { extraction.reporter_name = value; return true; }
  if (pendingField === 'victim_name' && !extraction.victim_name) { extraction.victim_name = value; return true; }
  if (pendingField === 'amount' || pendingField === 'total_invested') {
    const numeric = Number(value.replace(/[^\d.]/g, ''));
    if (Number.isFinite(numeric) && numeric >= 0 && extraction.slots[pendingField] === null) {
      extraction.slots[pendingField] = numeric;
      return true;
    }
    return false;
  }
  if (arrays.has(pendingField)) {
    const current = extraction.slots[pendingField as keyof IntakeExtraction['slots']];
    if (Array.isArray(current) && current.length === 0) {
      (extraction.slots as Record<string, unknown>)[pendingField] = [value];
      return true;
    }
    return false;
  }
  if (pendingField in extraction.slots && extraction.slots[pendingField as keyof IntakeExtraction['slots']] === null) {
    (extraction.slots as Record<string, unknown>)[pendingField] = value;
    return true;
  }
  return false;
}

function complete(draft: OrchestratorDraft, field: string) {
  const value = draft.slots[field];
  if (field === 'suspect_contacts' && !value) return Boolean(draft.slots.payee_identifier);
  if (field === 'narrative') return typeof value === 'string' && value.trim().length >= 20;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

export function nextRequiredField(draft: OrchestratorDraft): string | null {
  if (!draft.category || !playbooks[draft.category]) return 'category';
  const playbook = playbooks[draft.category];
  if (playbook.anonymousAllowed && draft.anonymous === undefined) return 'anonymous_choice';
  for (const field of playbook.slots) if (!complete(draft, field)) return field;
  if (draft.onBehalfOf && !draft.contact.victim_name) return 'victim_name';
  if (!draft.anonymous && !draft.contact.reporter_name) return 'reporter_name';
  return null;
}

const questions: Record<SpokenLanguage, Record<string, string>> = {
  en: {
    category: 'Which kind of incident was this: payment fraud, account hacking, harassment, impersonation, or something else?', anonymous_choice: 'Would you like to report this anonymously?', narrative: 'Please describe what happened from the beginning.', amount: 'How much money was lost?', incident_at: 'When did the transaction or incident happen?', instrument: 'Which payment method was used?', txns: 'Please tell me all the transaction or reference IDs.', payee_identifier: 'What identifier was used for the recipient, such as a UPI ID, phone number, or account reference?', own_bank: 'Which bank or payment provider did you use?', suspect_contacts: 'What contact or payment identifier did the suspect use?', platforms: 'Which platform or account was affected?', urls: 'What website or profile link was involved?', first_seen_at: 'When did you first notice it?', suspect_handles: 'What username or handle did the suspect use?', account_id: 'What username, phone number, or email identified the affected account?', when_lost: 'When did you lose access to the account?', recovery_tried: 'What recovery steps have you already tried?', system_affected: 'Which device, system, or data was affected?', ransom_note: 'What did the ransom message demand?', when: 'When did this happen?', numbers: 'Which phone numbers were involved?', message_samples: 'What did the suspicious message say?', caller_claims: 'Who did the caller claim to be?', platform_name: 'Which platform or service was used?', total_invested: 'How much money did you invest in total?', app_name: 'What was the name of the suspicious app?', wallet_addresses: 'Which crypto wallet addresses were involved?', exchange: 'Which crypto exchange or service was involved?', reporter_name: 'What fictional name should I record for the reporter?', victim_name: 'What fictional name should I record for the person you are reporting for?', correction: 'What would you like me to correct?',
  },
  hi: {
    category: 'यह किस तरह की घटना थी: पैसे की धोखाधड़ी, अकाउंट हैक, उत्पीड़न, पहचान की नकल, या कुछ और?', anonymous_choice: 'क्या आप यह शिकायत गुमनाम रूप से दर्ज करना चाहते हैं?', narrative: 'कृपया शुरू से बताइए कि क्या हुआ था।', amount: 'कितनी रकम का नुकसान हुआ?', incident_at: 'लेन-देन या घटना कब हुई थी?', instrument: 'भुगतान का कौन सा तरीका इस्तेमाल हुआ था?', txns: 'कृपया सभी ट्रांज़ैक्शन या रेफरेंस आईडी बताइए।', payee_identifier: 'पैसे पाने वाले की यूपीआई आईडी, फोन नंबर, या अकाउंट रेफरेंस क्या था?', own_bank: 'आपने कौन सा बैंक या पेमेंट सेवा इस्तेमाल की थी?', suspect_contacts: 'संदिग्ध ने कौन सा संपर्क या पेमेंट पहचान इस्तेमाल की?', platforms: 'कौन सा प्लेटफॉर्म या अकाउंट प्रभावित हुआ?', urls: 'कौन सा वेबसाइट या प्रोफाइल लिंक शामिल था?', first_seen_at: 'आपने इसे पहली बार कब देखा?', suspect_handles: 'संदिग्ध ने कौन सा यूज़रनेम या हैंडल इस्तेमाल किया?', account_id: 'प्रभावित अकाउंट का यूज़रनेम, फोन नंबर, या ईमेल क्या था?', when_lost: 'अकाउंट का एक्सेस कब गया?', recovery_tried: 'आपने अकाउंट वापस पाने के लिए अब तक क्या कोशिश की?', system_affected: 'कौन सा डिवाइस, सिस्टम, या डेटा प्रभावित हुआ?', ransom_note: 'फिरौती वाले संदेश में क्या माँगा गया था?', when: 'यह घटना कब हुई?', numbers: 'कौन से फोन नंबर शामिल थे?', message_samples: 'संदिग्ध संदेश में क्या लिखा था?', caller_claims: 'कॉलर ने खुद को कौन बताया था?', platform_name: 'कौन सा प्लेटफॉर्म या सेवा इस्तेमाल हुई?', total_invested: 'आपने कुल कितनी रकम निवेश की थी?', app_name: 'संदिग्ध ऐप का नाम क्या था?', wallet_addresses: 'कौन से क्रिप्टो वॉलेट पते शामिल थे?', exchange: 'कौन सा क्रिप्टो एक्सचेंज या सेवा शामिल थी?', reporter_name: 'रिपोर्टर के लिए कौन सा काल्पनिक नाम दर्ज करूँ?', victim_name: 'जिस व्यक्ति के लिए आप रिपोर्ट कर रहे हैं, उसका कौन सा काल्पनिक नाम दर्ज करूँ?', correction: 'आप कौन सी जानकारी ठीक करवाना चाहते हैं?',
  },
  'hi-en': {
    category: 'Yeh kis type ka incident tha: payment fraud, account hack, harassment, impersonation, ya kuch aur?', anonymous_choice: 'Kya aap yeh complaint anonymously register karna chahte hain?', narrative: 'Please shuru se bataiye ki kya hua tha.', amount: 'Kitne paise ka loss hua?', incident_at: 'Transaction ya incident kab hua tha?', instrument: 'Kaunsa payment method use hua tha?', txns: 'Please saare transaction ya reference IDs bataiye.', payee_identifier: 'Recipient ki UPI ID, phone number, ya account reference kya tha?', own_bank: 'Aapne kaunsa bank ya payment provider use kiya tha?', suspect_contacts: 'Suspect ne kaunsa contact ya payment identifier use kiya?', platforms: 'Kaunsa platform ya account affect hua?', urls: 'Kaunsa website ya profile link involved tha?', first_seen_at: 'Aapne ise pehli baar kab notice kiya?', suspect_handles: 'Suspect ka username ya handle kya tha?', account_id: 'Affected account ka username, phone number, ya email kya tha?', when_lost: 'Account ka access kab gaya?', recovery_tried: 'Account recover karne ke liye aapne ab tak kya try kiya?', system_affected: 'Kaunsa device, system, ya data affect hua?', ransom_note: 'Ransom message mein kya demand ki gayi thi?', when: 'Yeh kab hua tha?', numbers: 'Kaunse phone numbers involved the?', message_samples: 'Suspicious message mein kya likha tha?', caller_claims: 'Caller ne khud ko kaun bataya tha?', platform_name: 'Kaunsa platform ya service use hua tha?', total_invested: 'Aapne total kitne paise invest kiye the?', app_name: 'Suspicious app ka naam kya tha?', wallet_addresses: 'Kaunse crypto wallet addresses involved the?', exchange: 'Kaunsa crypto exchange ya service involved thi?', reporter_name: 'Reporter ke liye kaunsa fictional naam save karoon?', victim_name: 'Jiske liye aap report kar rahe hain, unka kaunsa fictional naam save karoon?', correction: 'Aap kaunsi detail correct karwana chahte hain?',
  },
};

const acknowledgements: Record<SpokenLanguage, string> = { en: 'I have saved that.', hi: 'ठीक है, मैंने यह जानकारी दर्ज कर ली है।', 'hi-en': 'Theek hai, maine yeh detail save kar li hai.' };

export const openingReply = () => 'Namaste. I am an independent prototype, not a government service. Please use fictional personal details. Tell me what happened in Hindi, Hinglish, or English.';

export function questionReply(language: VoiceLanguage, field: string, savedCount = 0) {
  const spoken = language === 'und' ? 'en' : language;
  const question = questions[spoken][field] ?? (spoken === 'hi' ? 'कृपया यह जानकारी बताइए।' : spoken === 'hi-en' ? 'Please yeh detail bataiye.' : 'Please share that detail.');
  return savedCount ? `${acknowledgements[spoken]} ${question}` : question;
}

export function confirmationReply(draft: OrchestratorDraft) {
  const parts: string[] = [];
  if (draft.category) parts.push(categoryLabels[draft.category] ?? draft.category);
  if (draft.slots.amount) parts.push(`amount ${draft.slots.amount}`);
  if (draft.contact.reporter_name) parts.push(`reporter ${draft.contact.reporter_name}`);
  const summary = parts.length ? `: ${parts.join(', ')}` : '';
  if (draft.language === 'hi') return `मेरे पास सभी ज़रूरी जानकारी है${summary}। क्या मैं अब शिकायत दर्ज कर दूँ?`;
  if (draft.language === 'hi-en') return `Mere paas saari required details hain${summary}. Kya main ab complaint register kar doon?`;
  return `I have all the required details${summary}. Should I register the complaint now?`;
}

export const correctionReply = (language: VoiceLanguage) => questionReply(language, 'correction');

export function registeredReply(language: VoiceLanguage, caseNumber: string) {
  const spoken = caseNumber.split('').join(' ');
  if (language === 'hi') return `शिकायत दर्ज हो गई है। आपका केस नंबर ${spoken} है। इसे सुरक्षित रखिए।`;
  if (language === 'hi-en') return `Complaint register ho gayi hai. Aapka case number ${spoken} hai. Ise safely save kar lijiye.`;
  return `The complaint is registered. Your case number is ${spoken}. Please save it safely.`;
}
