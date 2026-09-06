import { desc, eq, inArray, sql as dsql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cases, caseSignals, patterns, suspects, type CaseRow, type PatternRow } from '../db/schema.js';
import { chatJson, embedText } from '../agent/realtime.js';
import { redactDeep } from '../lib/redact.js';
import { sha256 } from '../lib/ids.js';
import { categoryLabel } from './labels.js';
import { getPlaybook } from './playbooks.js';
import { GUIDANCE_EN } from './guidance/en.js';
import { addEvent } from './events.js';

/**
 * Scam radar — every registered case yields a PII-free "signature"; embeddings cluster
 * signatures into patterns; the text model writes the public awareness brief.
 * Auto-publishes at 2+ reports (no manual review, per product decision).
 */

export const MODUS = [
  'kyc_otp_vishing', 'courier_customs_parcel', 'digital_arrest', 'investment_trading', 'loan_app_extortion',
  'job_fraud', 'matrimonial', 'crypto', 'bec_wire', 'sextortion', 'ncii_expartner', 'csam', 'stalking_harassment',
  'impersonation_profile', 'account_takeover', 'ransomware', 'telecom_sim', 'upi_collect_request',
  'fake_customer_care', 'other',
] as const;
export type Modus = typeof MODUS[number];

export interface Signature {
  modus: Modus; impersonated: string | null; persona_name: string | null; channel: string | null;
  region: string | null; amount_band: string | null; hooks: string[]; one_line: string;
}
export interface SimilarInfo {
  pattern_id: string; title: string; count_30d: number; report_count: number;
  regions: Record<string, number>; similarity: number;
}
interface CachedSignal { signature: Signature; embedding?: number[]; similar?: SimilarInfo | null; narrative_hash: string; pattern_id?: string }

const CATEGORY_DEFAULT_MODUS: Record<string, Modus> = {
  financial_upi: 'upi_collect_request', financial_card: 'kyc_otp_vishing', financial_netbanking: 'kyc_otp_vishing',
  financial_wallet: 'fake_customer_care', financial_investment: 'investment_trading', financial_loan_app: 'loan_app_extortion',
  financial_job_fraud: 'job_fraud', financial_courier_customs: 'courier_customs_parcel', financial_matrimonial: 'matrimonial',
  financial_crypto: 'crypto', financial_bec: 'bec_wire', financial_sextortion_paid: 'sextortion', digital_arrest_paid: 'digital_arrest',
  wc_ncii: 'ncii_expartner', wc_csam_report: 'csam', wc_stalking: 'stalking_harassment', social_impersonation: 'impersonation_profile',
  account_takeover: 'account_takeover', hacking_ransomware: 'ransomware', telecom_fraud: 'telecom_sim',
  digital_arrest_no_loss: 'digital_arrest', generic_other: 'other',
};

export function amountBand(n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null;
  if (n < 10_000) return '<10k'; if (n < 50_000) return '10k-50k'; if (n < 200_000) return '50k-2L';
  if (n < 1_000_000) return '2L-10L'; return '10L+';
}

const EXTRACT_SYSTEM =
  'You extract an ANONYMISED pattern signature from a cybercrime complaint, for aggregate public awareness. ' +
  'Return JSON with exactly these keys: ' +
  `modus (one of: ${MODUS.join(', ')}), ` +
  'impersonated (the entity the scammer pretended to be, e.g. "SBI", "CBI", "customs", "Amazon", else null), ' +
  'persona_name (the name the SCAMMER used for themselves, else null — NEVER the victim\'s name), ' +
  'channel (voice_call | whatsapp_video | whatsapp | sms | email | social_dm | website | app | in_person | null), ' +
  'region (an Indian city or state named in the story, else null), ' +
  'amount_band (echo the input amount_band), ' +
  'hooks (up to 5 short phrases describing the lure, e.g. "KYC expiry", "parcel with drugs", "verification fee"), ' +
  'one_line (≤140 characters, present tense, generic: how the scheme works — no victim names, no phone numbers, no exact amounts, no account or transaction ids). ' +
  'Never include personal data of the victim.';

export async function extractSignature(c: CaseRow): Promise<Signature> {
  const slots = redactDeep({ ...((c.slots ?? {}) as Record<string, unknown>) });
  delete slots.__signal;
  const band = amountBand(c.amountLost !== null ? Number(c.amountLost) : null);
  const fallback: Signature = {
    modus: CATEGORY_DEFAULT_MODUS[c.category] ?? 'other', impersonated: null, persona_name: null, channel: null,
    region: null, amount_band: band, hooks: [], one_line: `${categoryLabel(c.category).en} reported`,
  };
  const out = await chatJson<Partial<Signature>>(EXTRACT_SYSTEM, JSON.stringify({
    category: c.category, category_label: categoryLabel(c.category).en, amount_band: band,
    narrative: slots.narrative, instrument: slots.instrument, platforms: slots.platforms, caller_claims: slots.caller_claims,
    app_name: slots.app_name, platform_name: slots.platform_name, message_samples: slots.message_samples,
  }));
  if (!out) return fallback;
  const str = (v: unknown, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const modus = (MODUS as readonly string[]).includes(String(out.modus)) ? (out.modus as Modus) : fallback.modus;
  return {
    modus,
    impersonated: str(out.impersonated), persona_name: str(out.persona_name, 40), channel: str(out.channel, 30),
    region: str(out.region, 40), amount_band: band,
    hooks: Array.isArray(out.hooks) ? out.hooks.filter((h) => typeof h === 'string').map((h) => h.slice(0, 40)).slice(0, 5) : [],
    one_line: str(out.one_line, 160) ?? fallback.one_line,
  };
}

export function embeddingText(s: Signature): string {
  return [s.modus, s.impersonated, s.persona_name, s.channel, s.hooks.join(', '), s.one_line].filter(Boolean).join(' | ');
}

const vecLit = (v: number[]) => `[${v.join(',')}]`;

async function nearestPattern(modus: string, vec: number[], floor: number): Promise<{ id: string; sim: number } | null> {
  // top candidates in the same modus; prefer the LARGEST established cluster among those within
  // 0.05 of the best similarity — avoids fragmenting into many near-duplicate tiny patterns
  const rows = await db.execute(dsql`
    select id, report_count, 1 - (centroid <=> ${vecLit(vec)}::vector) as sim
    from patterns where modus = ${modus} and centroid is not null
    order by centroid <=> ${vecLit(vec)}::vector limit 4`);
  const cands = (rows as unknown as { id: string; report_count: number; sim: number | string }[])
    .map((r) => ({ id: r.id, n: Number(r.report_count), sim: Number(r.sim) }))
    .filter((r) => r.sim >= floor);
  if (cands.length === 0) return null;
  const best = cands[0].sim;
  const pick = cands.filter((r) => r.sim >= best - 0.05).sort((a, b) => b.n - a.n)[0];
  return { id: pick.id, sim: pick.sim };
}

export async function findSimilar(sig: Signature, vec: number[]): Promise<SimilarInfo | null> {
  const near = await nearestPattern(sig.modus, vec, 0.78);
  if (!near) return null;
  const [p] = await db.select().from(patterns).where(eq(patterns.id, near.id));
  if (!p || p.reportCount < 1) return null;
  return {
    pattern_id: p.id, title: p.title, count_30d: p.count30d, report_count: p.reportCount,
    regions: (p.regions ?? {}) as Record<string, number>, similarity: near.sim,
  };
}

/** Draft-time: extract + embed + cache in slots.__signal so the voice tool is fast. */
export async function computeDraftSignal(caseId: string): Promise<{ signature: Signature; similar: SimilarInfo | null } | null> {
  const [c] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!c) return null;
  const slots = (c.slots ?? {}) as Record<string, unknown>;
  if (typeof slots.narrative !== 'string' || c.category === 'unclassified') return null;
  const signature = await extractSignature(c);
  const vec = await embedText(embeddingText(signature));
  if (!vec) return null;
  const similar = await findSimilar(signature, vec);
  const cached: CachedSignal = { signature, embedding: vec, similar, narrative_hash: sha256(String(slots.narrative)) };
  await db.update(cases).set({ slots: { ...slots, __signal: cached } }).where(eq(cases.id, caseId));
  return { signature, similar };
}

export function cachedSignal(c: CaseRow): CachedSignal | null {
  const s = ((c.slots ?? {}) as Record<string, unknown>).__signal as CachedSignal | undefined;
  if (!s?.signature) return null;
  const narrative = String(((c.slots ?? {}) as Record<string, unknown>).narrative ?? '');
  return s.narrative_hash === sha256(narrative) ? s : null;
}

/** Post-registration ingest: signal row → pattern assignment → refresh → timeline event. */
export async function radarIngest(c: CaseRow): Promise<void> {
  const slots = (c.slots ?? {}) as Record<string, unknown>;
  let cached = cachedSignal(c);
  if (!cached?.embedding) {
    const signature = await extractSignature(c);
    const embedding = await embedText(embeddingText(signature));
    if (!embedding) return;
    cached = { signature, embedding, narrative_hash: sha256(String(slots.narrative ?? '')) };
  }
  const sig = cached.signature; const vec = cached.embedding!;
  const [signal] = await db.insert(caseSignals).values({
    caseId: c.id, modus: sig.modus, impersonated: sig.impersonated, personaName: sig.persona_name, channel: sig.channel,
    region: sig.region, amountBand: sig.amount_band, hooks: sig.hooks, oneLine: sig.one_line, category: c.category,
    embedding: vec, reportedAt: c.registeredAt ?? new Date(),
  }).returning();
  const patternId = await assignPattern(signal.id, sig, vec, c.category);
  const p = await refreshPattern(patternId);
  await db.update(cases).set({ slots: { ...slots, __signal: { signature: sig, narrative_hash: cached.narrative_hash, pattern_id: patternId } } })
    .where(eq(cases.id, c.id));
  if (p && p.reportCount >= 2) {
    await addEvent(c.id, 'pattern_matched', 'system', { pattern_id: patternId, title: p.title, count_30d: p.count30d, report_count: p.reportCount });
  }
}

export async function assignPattern(signalId: string, sig: Signature, vec: number[], category: string | null): Promise<string> {
  const near = await nearestPattern(sig.modus, vec, 0.82);
  if (near) {
    const [p] = await db.select().from(patterns).where(eq(patterns.id, near.id));
    const old = p.centroid as number[] | null; const n = p.reportCount;
    const centroid = old && old.length === vec.length ? old.map((x, i) => (x * n + vec[i]) / (n + 1)) : vec;
    await db.update(patterns).set({ centroid }).where(eq(patterns.id, p.id));
    await db.update(caseSignals).set({ patternId: p.id }).where(eq(caseSignals.id, signalId));
    return p.id;
  }
  const [p] = await db.insert(patterns).values({
    modus: sig.modus, category, centroid: vec, title: sig.one_line.slice(0, 120), brief: sig.one_line,
  }).returning();
  await db.update(caseSignals).set({ patternId: p.id }).where(eq(caseSignals.id, signalId));
  return p.id;
}

export function maskIdentifier(kind: string, value: string): string {
  if (kind === 'phone') { const d = value.replace(/^\+91/, ''); return d.length >= 7 ? `${d.slice(0, 5)}•••${d.slice(-2)}` : '•••'; }
  if (kind === 'upi') { const [u, dom] = value.split('@'); return `${(u ?? '').slice(0, 3)}•••@${dom ?? ''}`; }
  if (kind === 'email') { const [u, dom] = value.split('@'); return `${(u ?? '').slice(0, 2)}•••@${dom ?? ''}`; }
  if (kind === 'url') return value;
  return `${value.slice(0, 3)}•••`;
}

const BRIEF_SYSTEM =
  'You write a public awareness card about a scam PATTERN for Indian citizens, from anonymised reports. ' +
  'Return JSON: {"title": ≤90 chars, plain words, names the scheme the way a friend would warn you; ' +
  '"brief": 2 sentences (≤320 chars) on how it runs and what to watch for — no victim data, no exact amounts, no phone numbers; ' +
  '"title_hi": the title in Hindi (Devanagari); "brief_hi": the brief in Hindi (Devanagari); ' +
  '"guidance_keys": up to 3 keys chosen ONLY from the allowed list}. Never invent statistics; counts are shown separately.';

export async function refreshPattern(patternId: string): Promise<PatternRow | null> {
  const [p] = await db.select().from(patterns).where(eq(patterns.id, patternId));
  if (!p) return null;
  const sigs = await db.select().from(caseSignals).where(eq(caseSignals.patternId, patternId)).orderBy(desc(caseSignals.reportedAt));
  const now = Date.now(); const day = 86_400_000;
  const age = (d: Date) => (now - new Date(d).getTime()) / day;
  const count30 = sigs.filter((s) => age(s.reportedAt) <= 30).length;
  const count7 = sigs.filter((s) => age(s.reportedAt) <= 7).length;
  const trend = Array.from({ length: 7 }, (_, i) => sigs.filter((s) => { const a = age(s.reportedAt); return a <= 7 - i && a > 6 - i; }).length);
  const regions: Record<string, number> = {};
  for (const s of sigs) if (s.region) regions[s.region] = (regions[s.region] ?? 0) + 1;

  const caseIds = sigs.map((s) => s.caseId).filter((x): x is string => !!x);
  const idCounts: Record<string, { kind: string; value: string; n: number }> = {};
  if (caseIds.length > 0) {
    const rows = await db.select().from(suspects).where(inArray(suspects.caseId, caseIds));
    for (const r of rows) { const k = `${r.kind}:${r.valueNorm}`; idCounts[k] = idCounts[k] ?? { kind: r.kind, value: r.valueNorm, n: 0 }; idCounts[k].n += 1; }
  }
  const identifiers = Object.values(idCounts).sort((a, b) => b.n - a.n).slice(0, 3)
    .map((x) => ({ kind: x.kind, masked: maskIdentifier(x.kind, x.value), reports: x.n }));

  const reportCount = sigs.length;
  const patch: Partial<typeof patterns.$inferInsert> = {
    reportCount, count30d: count30, count7d: count7, trend, regions, identifiers,
    firstSeen: sigs.length ? new Date(Math.min(...sigs.map((s) => new Date(s.reportedAt).getTime()))) : p.firstSeen,
    lastSeen: sigs.length ? new Date(Math.max(...sigs.map((s) => new Date(s.reportedAt).getTime()))) : p.lastSeen,
    published: reportCount >= 2, updatedAt: new Date(),
  };

  const needsBrief = !p.brief || reportCount <= 3 || reportCount % 5 === 0 || !p.titleHi;
  if (needsBrief && reportCount >= 1) {
    const category = p.category ?? sigs[0]?.category ?? null;
    const allowed = category ? (getPlaybook(category)?.guidance ?? []) : Object.keys(GUIDANCE_EN);
    const freq = (vals: (string | null)[]) => Object.entries(vals.filter((v): v is string => !!v).reduce<Record<string, number>>((m, v) => { m[v] = (m[v] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const out = await chatJson<{ title: string; brief: string; title_hi: string; brief_hi: string; guidance_keys: string[] }>(BRIEF_SYSTEM, JSON.stringify({
      modus: p.modus, category: category ? categoryLabel(category).en : null,
      sample_descriptions: sigs.slice(0, 6).map((s) => s.oneLine),
      impersonated: freq(sigs.map((s) => s.impersonated)), persona_names: freq(sigs.map((s) => s.personaName)),
      hooks: freq(sigs.flatMap((s) => (s.hooks as string[]))), channels: freq(sigs.map((s) => s.channel)),
      regions: Object.entries(regions).sort((a, b) => b[1] - a[1]).slice(0, 4),
      allowed_guidance_keys: allowed,
    }));
    if (out?.title && out.brief) {
      patch.title = out.title.slice(0, 120); patch.brief = out.brief.slice(0, 400);
      patch.titleHi = (out.title_hi ?? '').slice(0, 120); patch.briefHi = (out.brief_hi ?? '').slice(0, 400);
      patch.guidanceKeys = (out.guidance_keys ?? []).filter((k) => allowed.includes(k)).slice(0, 3);
    }
  }
  const [updated] = await db.update(patterns).set(patch).where(eq(patterns.id, patternId)).returning();
  return updated ?? null;
}

export interface PatternDto {
  id: string; modus: string; category: string | null; category_label: { en: string; hi: string } | null;
  title: string; brief: string; title_hi: string; brief_hi: string;
  guidance: { key: string; title: string; body: string }[];
  report_count: number; count_30d: number; count_7d: number; trend: number[];
  regions: { region: string; count: number }[]; identifiers: { kind: string; masked: string; reports: number }[];
  first_seen: Date; last_seen: Date;
}

function toDto(p: PatternRow): PatternDto {
  const regions = Object.entries((p.regions ?? {}) as Record<string, number>).map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  return {
    id: p.id, modus: p.modus, category: p.category, category_label: p.category ? categoryLabel(p.category) : null,
    title: p.title, brief: p.brief, title_hi: p.titleHi, brief_hi: p.briefHi,
    guidance: ((p.guidanceKeys ?? []) as string[]).map((k) => ({ key: k, title: GUIDANCE_EN[k]?.title ?? k, body: GUIDANCE_EN[k]?.body ?? '' })),
    report_count: p.reportCount, count_30d: p.count30d, count_7d: p.count7d, trend: (p.trend ?? []) as number[],
    regions, identifiers: (p.identifiers ?? []) as { kind: string; masked: string; reports: number }[],
    first_seen: p.firstSeen, last_seen: p.lastSeen,
  };
}

export async function listPatterns(limit = 30): Promise<PatternDto[]> {
  const rows = await db.select().from(patterns).where(eq(patterns.published, true)).orderBy(desc(patterns.count30d), desc(patterns.lastSeen)).limit(limit);
  return rows.map(toDto);
}

export async function getPattern(id: string): Promise<PatternDto | null> {
  const [p] = await db.select().from(patterns).where(eq(patterns.id, id));
  return p && p.published ? toDto(p) : null;
}

export async function radarStats(): Promise<{ reports_30d: number; active_patterns: number; top_region: string | null; fastest: { title: string; change_pct: number | null } | null }> {
  const pubs = await db.select().from(patterns).where(eq(patterns.published, true));
  const reports30 = pubs.reduce((a, p) => a + p.count30d, 0);
  const regionTotals: Record<string, number> = {};
  for (const p of pubs) for (const [r, n] of Object.entries((p.regions ?? {}) as Record<string, number>)) regionTotals[r] = (regionTotals[r] ?? 0) + n;
  const topRegion = Object.entries(regionTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  let fastest: { title: string; change_pct: number | null } | null = null;
  for (const p of pubs) {
    const prev7 = Math.max(0, p.count30d - p.count7d) / 3.3;   // rough previous-week baseline
    const change = prev7 > 0 ? Math.round(((p.count7d - prev7) / prev7) * 100) : null;
    if (!fastest || (change ?? -1) > (fastest.change_pct ?? -1)) fastest = { title: p.title, change_pct: change };
  }
  return { reports_30d: reports30, active_patterns: pubs.length, top_region: topRegion, fastest };
}

export async function patternForCase(caseId: string): Promise<{ id: string; title: string; title_hi: string; count_30d: number; report_count: number; top_region: string | null } | null> {
  const [sig] = await db.select().from(caseSignals).where(eq(caseSignals.caseId, caseId)).limit(1);
  if (!sig?.patternId) return null;
  const [p] = await db.select().from(patterns).where(eq(patterns.id, sig.patternId));
  if (!p || p.reportCount < 2) return null;
  const top = Object.entries((p.regions ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { id: p.id, title: p.title, title_hi: p.titleHi, count_30d: p.count30d, report_count: p.reportCount, top_region: top };
}
