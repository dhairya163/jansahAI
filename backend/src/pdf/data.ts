import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { caseEvents, type CaseRow } from '../db/schema.js';
import { categoryLabel, trackOf, sectionsLine, type Bi } from './labels-bridge.js';
import { amountInWords, formatINR } from '../lib/normalize.js';
import { virtualNow, fmtDateIST, fmtDateTimeIST, daysBetween, addDays } from '../lib/virtualTime.js';
import { translateToEnglish } from './translate.js';

export interface Txn { ref?: string; amount: number; at?: string; method?: string }
export interface EvidenceItem { description: string; source: string; capturedAt: string; hash: string | null }

export interface ArtifactData {
  c: CaseRow;
  slots: Record<string, unknown>;
  catLabel: Bi;
  trackLabel: Bi;
  isHindi: boolean;
  dateStr: string;
  dateTimeStr: string;
  virtualNote: string | null;
  registeredDateStr: string;
  daysSince: number;
  narrative: string;
  narrativeEn: string | null;
  txns: Txn[];
  identifiers: { kind: string; value: string }[];
  suspectMatches: { value: string; matches: number }[];
  amountWords: string;
  amountStr: string;
  sections: string;
  platforms: string[];
  urls: string[];
  heldAmount: string | null;
  heldConfirmedAt: string | null;
  evidence: EvidenceItem[];
  shoAppDateStr: string;   // when the SHO application was (to be) submitted — day-15 clock date
  spLetterDateStr: string; // day-29
  certinBody: string;
}

export async function buildArtifactData(c: CaseRow): Promise<ArtifactData> {
  const slots = (c.slots ?? {}) as Record<string, unknown>;
  const vNow = virtualNow(c.timeOffsetDays);
  const registeredAt = c.registeredAt ?? c.createdAt;
  const isHindi = (c.language ?? '').startsWith('hi');

  const txns: Txn[] = Array.isArray(slots.txns) ? (slots.txns as Txn[]) : [];
  const urls: string[] = Array.isArray(slots.urls) ? (slots.urls as string[]) : [];
  const platforms: string[] = Array.isArray(slots.platforms) ? (slots.platforms as string[]) : [];

  const identifiers: { kind: string; value: string }[] = [];
  if (typeof slots.payee_identifier === 'string') identifiers.push({ kind: String(slots.instrument ?? 'payee'), value: slots.payee_identifier });
  for (const u of urls) identifiers.push({ kind: 'url', value: u });
  for (const h of (Array.isArray(slots.suspect_handles) ? slots.suspect_handles as string[] : [])) identifiers.push({ kind: 'handle', value: h });
  for (const n of (Array.isArray(slots.numbers) ? slots.numbers as string[] : [])) identifiers.push({ kind: 'phone', value: n });
  for (const sc of (Array.isArray(slots.suspect_contacts) ? slots.suspect_contacts as { kind: string; value: string }[] : [])) {
    identifiers.push({ kind: sc.kind, value: sc.value });
  }

  // suspect repository matches + freeze info from events
  const evs = await db.select().from(caseEvents).where(eq(caseEvents.caseId, c.id)).orderBy(desc(caseEvents.createdAt));
  const suspectMatches = evs.filter((e) => e.type === 'suspect_match')
    .map((e) => {
      const p = e.payload as Record<string, unknown>;
      return { value: String(p.value ?? ''), matches: Number(p.matches ?? 0) };
    });
  const freeze = evs.find((e) => e.type === 'freeze_confirmed');
  const heldAmount = c.amountHeld ? formatINR(Number(c.amountHeld)) : (freeze ? formatINR(Number((freeze.payload as Record<string, unknown>).amount_held)) : null);
  const heldConfirmedAt = freeze ? fmtDateIST(freeze.virtualAt ?? freeze.createdAt) : null;

  const narrative = typeof slots.narrative === 'string' ? slots.narrative : '';
  const narrativeEn = await translateToEnglish(narrative, c.language);

  const amountNum = c.amountLost !== null ? Number(c.amountLost) : null;

  const evidence: EvidenceItem[] = [];
  const stamp = fmtDateTimeIST(vNow);
  for (const t of txns) evidence.push({
    description: `Transaction${t.ref ? ` ref ${t.ref}` : ''} of ${formatINR(t.amount)}${t.method ? ` via ${t.method}` : ''}${t.at ? ` at ${t.at}` : ''}`,
    source: 'Stated during voice intake', capturedAt: stamp, hash: null,
  });
  for (const u of urls) evidence.push({ description: `URL: ${u}`, source: 'Stated during voice intake', capturedAt: stamp, hash: null });
  for (const m of (Array.isArray(slots.message_samples) ? slots.message_samples as string[] : [])) {
    evidence.push({ description: `Message sample: “${m}”`, source: 'Stated during voice intake', capturedAt: stamp, hash: null });
  }
  if (typeof slots.ransom_note === 'string' && slots.ransom_note) {
    evidence.push({ description: `Ransom note (excerpt): “${slots.ransom_note}”`, source: 'Stated during voice intake', capturedAt: stamp, hash: null });
  }
  if (evidence.length === 0) evidence.push({
    description: 'Oral account as recorded in the annexed complaint', source: 'Voice intake', capturedAt: stamp, hash: null,
  });

  return {
    c, slots,
    catLabel: categoryLabel(c.category),
    trackLabel: trackOf(c.track),
    isHindi,
    dateStr: fmtDateIST(vNow),
    dateTimeStr: fmtDateTimeIST(vNow),
    virtualNote: c.timeOffsetDays > 0 ? `virtual day ${c.timeOffsetDays} — demo time machine` : null,
    registeredDateStr: fmtDateIST(registeredAt),
    daysSince: Math.max(0, daysBetween(registeredAt, vNow)),
    narrative, narrativeEn,
    txns, identifiers, suspectMatches,
    amountWords: amountNum !== null ? amountInWords(amountNum) : '—',
    amountStr: amountNum !== null ? formatINR(amountNum) : '—',
    sections: sectionsLine(c.category),
    platforms, urls,
    heldAmount, heldConfirmedAt,
    evidence,
    shoAppDateStr: fmtDateIST(addDays(registeredAt, 15)),
    spLetterDateStr: fmtDateIST(addDays(registeredAt, 29)),
    certinBody: buildCertinBody(c, slots, fmtDateTimeIST(vNow)),
  };
}

export function buildCertinBody(c: CaseRow, slots: Record<string, unknown>, when: string): string {
  const lines = [
    'To: incident@cert-in.org.in',
    `Subject: Incident report — ${categoryLabel(c.category).en} (reference ${c.caseNumber})`,
    '',
    'Dear CERT-In team,',
    '',
    'I wish to report the following cyber incident:',
    `• Incident type: ${categoryLabel(c.category).en}`,
    `• Affected system/account: ${String(slots.system_affected ?? slots.account_id ?? slots.platforms ?? '—')}`,
    `• Timeline: ${String(slots.when ?? slots.when_lost ?? slots.incident_at ?? '—')} (reported ${when})`,
    `• Indicators (IDs/URLs/addresses): ${[slots.urls, slots.numbers, slots.wallet_addresses, slots.payee_identifier].flat().filter(Boolean).join(', ') || '—'}`,
    `• Actions taken so far: ${String(slots.recovery_tried ?? 'Complaint recorded on national portal (ack no. ' + c.caseNumber + ')')}`,
    `• Contact: ${c.anonymous ? 'Complainant chose anonymous filing' : (c.reporterName ?? '—')}${c.email ? `, ${c.email}` : ''}`,
    '',
    'Kindly acknowledge and advise on further containment steps.',
    '',
    'Sincerely,',
    c.anonymous ? '(Anonymous complainant)' : (c.reporterName ?? '—'),
    '',
    '[Prototype note: send this yourself from your own mailbox — this system never emails authorities.]',
  ];
  return lines.join('\n');
}
