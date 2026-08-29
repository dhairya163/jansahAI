import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { caseEvents, cases, type CaseEventRow } from '../db/schema.js';
import { redactDeep } from '../lib/redact.js';
import { virtualNow, fmtDateTimeIST } from '../lib/virtualTime.js';
import { broadcast } from '../lib/supabase.js';
import { statusLabel } from './labels.js';
import { formatINR } from '../lib/normalize.js';
import { getGuidance } from './guidance/index.js';

export type Actor = 'citizen' | 'agent' | 'system' | 'ops';

/** §16.3 event catalogue */
export type EventType =
  | 'registered' | 'identity_verified' | 'identity_skipped_anonymous' | 'contact_captured'
  | 'artifact_generated' | 'email_sent' | 'email_skipped_no_address' | 'freeze_requested'
  | 'freeze_confirmed' | 'suspect_match' | 'ezero_fir_notice' | 'clock_fired' | 'clock_skipped'
  | 'status_changed' | 'fir_marked' | 'restoration_offered' | 'restoration_requested'
  | 'note' | 'time_advanced' | 'withdrawn' | 'platform_ack' | 'content_removed'
  | 'amount_restored' | 'immediate_failed' | 'offer';

export async function addEvent(
  caseId: string,
  type: EventType,
  actor: Actor,
  payload: Record<string, unknown> = {},
): Promise<CaseEventRow> {
  const [c] = await db.select({ offset: cases.timeOffsetDays }).from(cases).where(eq(cases.id, caseId));
  const vAt = virtualNow(c?.offset ?? 0);
  const [row] = await db.insert(caseEvents).values({
    caseId, type, actor,
    payload: redactDeep(payload),
    virtualAt: vAt,
  }).returning();
  void broadcast(`case:${caseId}`, 'event_added', {
    id: row.id, type, actor, payload: row.payload, virtual_at: vAt.toISOString(),
  });
  return row;
}

export interface TimelineLine {
  id: string;
  type: string;
  actor: string;
  en: string;
  hi: string;
  virtual_at: string | null;
  created_at: string;
  artifact_id?: string;
  artifact_kind?: string;
  payload?: Record<string, unknown>;
}

const ARTIFACT_LINE: Record<string, { en: string; hi: string }> = {
  complaint_pdf: { en: 'Complaint PDF generated', hi: 'शिकायत PDF तैयार' },
  bank_notice: { en: 'Bank dispute notice generated (RBI limited-liability format)', hi: 'बैंक विवाद नोटिस तैयार (RBI सीमित-देनदारी प्रारूप)' },
  fir_pack: { en: 'FIR application pack generated — ready to sign', hi: 'FIR आवेदन पैक तैयार — हस्ताक्षर के लिए' },
  sp_letter: { en: 'Superintendent of Police escalation letter generated', hi: 'पुलिस अधीक्षक (SP) को पत्र तैयार' },
  magistrate_draft: { en: 'Magistrate application draft generated (lawyer review advised)', hi: 'मजिस्ट्रेट आवेदन का मसौदा तैयार (वकील से समीक्षा कराएँ)' },
  takedown_letter: { en: 'Platform takedown letter generated (24-hour rule)', hi: 'प्लेटफ़ॉर्म takedown पत्र तैयार (24-घंटे नियम)' },
  certin_email: { en: 'CERT-In incident email drafted', hi: 'CERT-In incident ईमेल तैयार' },
  gac_note: { en: 'GAC appeal note generated', hi: 'GAC अपील नोट तैयार' },
  restoration_request: { en: 'Money-restoration request generated', hi: 'धन-वापसी अनुरोध तैयार' },
};

/** Render one human timeline line per event, EN + HI, no joins needed (§16.3). */
export function humanizeEvent(e: CaseEventRow): TimelineLine {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const base: TimelineLine = {
    id: e.id, type: e.type, actor: e.actor,
    en: e.type, hi: e.type,
    virtual_at: e.virtualAt ? new Date(e.virtualAt).toISOString() : null,
    created_at: new Date(e.createdAt).toISOString(),
    payload: p,
  };
  const set = (en: string, hi: string) => { base.en = en; base.hi = hi; };

  switch (e.type) {
    case 'registered':
      set(`Complaint registered${p.language ? ` by voice (${p.language})` : ''} — case ${p.case_number ?? ''}`,
        `शिकायत दर्ज${p.language ? ` (आवाज़ से, ${p.language})` : ''} — केस ${p.case_number ?? ''}`);
      break;
    case 'identity_verified':
      set(`Identity verified — Aadhaar ••${p.aadhaar_last4 ?? '••••'} (mock OTP)`,
        `पहचान सत्यापित — आधार ••${p.aadhaar_last4 ?? '••••'} (मॉक OTP)`);
      break;
    case 'identity_skipped_anonymous':
      set('Filed anonymously — identity not collected (this track permits it)',
        'गुमनाम शिकायत — पहचान नहीं ली गई (इस ट्रैक में अनुमति है)');
      break;
    case 'contact_captured':
      set(`Contact saved${p.email ? ` — updates to ${p.email}` : ''}`,
        `संपर्क सहेजा गया${p.email ? ` — अपडेट ${p.email} पर` : ''}`);
      break;
    case 'artifact_generated': {
      const kind = String(p.kind ?? '');
      const l = ARTIFACT_LINE[kind] ?? { en: `Document generated (${kind})`, hi: `दस्तावेज़ तैयार (${kind})` };
      set(String(p.label_en ?? l.en), String(p.label_hi ?? l.hi));
      base.artifact_id = p.artifact_id as string | undefined;
      base.artifact_kind = kind;
      break;
    }
    case 'email_sent':
      set(`Email sent to ${p.to ?? 'you'} — ${p.subject ?? ''}`, `ईमेल भेजा गया (${p.to ?? 'आपको'})`);
      break;
    case 'email_skipped_no_address':
      set('Email skipped — no address on file', 'ईमेल नहीं भेजा — कोई पता दर्ज नहीं');
      break;
    case 'freeze_requested':
      set('Freeze requested on beneficiary account (simulated CFCFRMS chain)',
        'लाभार्थी खाते पर फ्रीज़ का अनुरोध (सिम्युलेटेड CFCFRMS)');
      break;
    case 'freeze_confirmed':
      set(`Freeze confirmed — ${formatINR(p.amount_held as number)} held (officials console)`,
        `फ्रीज़ पक्का — ${formatINR(p.amount_held as number)} होल्ड पर (अधिकारी कंसोल)`);
      break;
    case 'suspect_match':
      set(`Suspect identifier ${p.value ?? ''} found in ${p.matches ?? '?'} prior report(s)`,
        `संदिग्ध पहचानकर्ता ${p.value ?? ''} पहले ${p.matches ?? '?'} रिपोर्ट में मिला`);
      break;
    case 'ezero_fir_notice':
      set('Loss is ₹10 lakh+ — on the real system an e-Zero FIR would auto-register',
        'नुकसान ₹10 लाख+ — असली व्यवस्था में e-Zero FIR अपने आप दर्ज होती');
      break;
    case 'clock_fired':
      set(`Clock fired: ${p.step_key ?? ''} (day ${p.due_days ?? '?'})`,
        `क्लॉक चला: ${p.step_key ?? ''} (दिन ${p.due_days ?? '?'})`);
      break;
    case 'clock_skipped':
      set(`Clock skipped: ${p.step_key ?? ''} — condition no longer holds`,
        `क्लॉक छोड़ा गया: ${p.step_key ?? ''}`);
      break;
    case 'status_changed': {
      const to = statusLabel(String(p.to ?? ''));
      set(`Status: ${to.en}`, `स्थिति: ${to.hi}`);
      break;
    }
    case 'fir_marked':
      set(`FIR registered — number ${p.fir_number ?? ''} (officials console)`,
        `FIR दर्ज — संख्या ${p.fir_number ?? ''} (अधिकारी कंसोल)`);
      break;
    case 'restoration_offered':
      set('Restoration request available against this case number',
        'इस केस नंबर पर धन-वापसी अनुरोध उपलब्ध');
      break;
    case 'restoration_requested':
      set(`Restoration requested for ${formatINR(p.amount_held as number)}`,
        `${formatINR(p.amount_held as number)} की वापसी का अनुरोध`);
      break;
    case 'amount_restored':
      set(`Amount restored — ${formatINR(p.amount as number)} returned to source account`,
        `राशि वापस — ${formatINR(p.amount as number)} मूल खाते में`);
      break;
    case 'note':
      set(`Note: ${p.text ?? ''}`, `नोट: ${p.text ?? ''}`);
      break;
    case 'time_advanced':
      set(`Demo time machine: +${p.days ?? '?'} day(s) → day ${p.total_offset ?? '?'}`,
        `डेमो टाइम मशीन: +${p.days ?? '?'} दिन → दिन ${p.total_offset ?? '?'}`);
      break;
    case 'withdrawn':
      set('Complaint withdrawn at your request', 'आपके अनुरोध पर शिकायत वापस');
      break;
    case 'platform_ack':
      set('Platform acknowledged the complaint (simulated)', 'प्लेटफ़ॉर्म ने शिकायत स्वीकारी (सिम्युलेटेड)');
      break;
    case 'content_removed':
      set('Content removed by platform (simulated)', 'प्लेटफ़ॉर्म ने सामग्री हटाई (सिम्युलेटेड)');
      break;
    case 'offer': {
      const g = getGuidance(String(p.key ?? ''));
      set(`Next step available: ${g?.en.title ?? p.key}`, `अगला कदम उपलब्ध: ${g?.hi.title ?? p.key}`);
      break;
    }
    case 'immediate_failed':
      set(`A background step failed and was logged (${p.step ?? ''})`, `एक पिछला कदम विफल रहा (${p.step ?? ''})`);
      break;
    default:
      set(`${e.type}`, `${e.type}`);
  }
  return base;
}

export function timelineTimestamp(line: TimelineLine): string {
  return fmtDateTimeIST(line.virtual_at ? new Date(line.virtual_at) : new Date(line.created_at));
}
