import { eq, isNull, ne } from 'drizzle-orm';
import { db, sql } from '../src/db/client.js';
import { cases, caseSignals, patterns } from '../src/db/schema.js';
import { embedText } from '../src/agent/realtime.js';
import { assignPattern, embeddingText, refreshPattern, radarIngest, type Signature } from '../src/engine/radar.js';

/** Synthetic, anonymised signals across six schemes so the radar is alive on day one; then backfill real cases. */

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000 - Math.floor(Math.random() * 6e6));
type Seed = { sig: Signature; category: string; days: number[] };

const SEEDS: Seed[] = [
  { category: 'financial_netbanking', days: [0.2, 0.8, 1, 2, 2, 3, 4, 5, 6, 8, 9, 11, 13, 14, 17, 19, 21, 24, 26, 29], sig: {
    modus: 'kyc_otp_vishing', impersonated: 'SBI', persona_name: 'Rahul', channel: 'voice_call', region: 'Bengaluru', amount_band: '50k-2L',
    hooks: ['KYC expiry', 'account will be blocked', 'OTP'], one_line: 'Caller posing as the SBI KYC desk says the account expires today and takes an OTP; a large debit follows within minutes' } },
  { category: 'financial_netbanking', days: [1, 3, 7, 12, 18, 22, 27], sig: {
    modus: 'kyc_otp_vishing', impersonated: 'HDFC Bank', persona_name: 'Priya', channel: 'voice_call', region: 'Delhi', amount_band: '10k-50k',
    hooks: ['KYC update', 'OTP', 'link on SMS'], one_line: 'Bank-KYC caller sends an SMS link and asks for the OTP to "complete verification"; money leaves the account' } },
  { category: 'financial_courier_customs', days: [0.5, 1, 2, 4, 6, 9, 10, 13, 16, 20, 25, 28], sig: {
    modus: 'courier_customs_parcel', impersonated: 'customs / FedEx', persona_name: null, channel: 'voice_call', region: 'Bengaluru', amount_band: '10k-50k',
    hooks: ['parcel with drugs', 'verification fee', 'arrest threat'], one_line: 'Courier-customs caller claims a parcel in your name holds drugs and demands a verification fee by UPI to avoid arrest' } },
  { category: 'digital_arrest_paid', days: [1, 2, 5, 8, 11, 15, 19, 23, 26], sig: {
    modus: 'digital_arrest', impersonated: 'CBI', persona_name: 'Officer Verma', channel: 'whatsapp_video', region: 'Jaipur', amount_band: '2L-10L',
    hooks: ['money laundering case', 'video custody', 'transfer for verification'], one_line: 'Fake CBI officers hold the victim on WhatsApp video for hours and demand transfers to "verify" funds' } },
  { category: 'digital_arrest_no_loss', days: [0.3, 3, 6, 12, 17, 21], sig: {
    modus: 'digital_arrest', impersonated: 'Mumbai police / TRAI', persona_name: null, channel: 'whatsapp_video', region: 'Pune', amount_band: null,
    hooks: ['SIM misuse', 'arrest warrant', 'stay on video'], one_line: 'Callers posing as police or TRAI threaten arrest over "SIM misuse" and keep the victim on a video call' } },
  { category: 'financial_investment', days: [2, 4, 7, 9, 14, 16, 20, 24, 27, 29], sig: {
    modus: 'investment_trading', impersonated: 'stock-tips group', persona_name: 'Neha', channel: 'whatsapp', region: 'Hyderabad', amount_band: '2L-10L',
    hooks: ['guaranteed returns', 'fake trading dashboard', 'withdrawal tax'], one_line: 'WhatsApp trading group shows fake profits on an app, then blocks withdrawals until a "tax" is paid' } },
  { category: 'financial_loan_app', days: [1, 5, 10, 15, 22], sig: {
    modus: 'loan_app_extortion', impersonated: 'instant loan app', persona_name: null, channel: 'app', region: 'Lucknow', amount_band: '<10k',
    hooks: ['contact-list access', 'morphed photos', 'daily threats'], one_line: 'Instant-loan app scrapes contacts and extorts with morphed photos and threats even after repayment' } },
  { category: 'wc_ncii', days: [2, 6, 13, 19, 25], sig: {
    modus: 'ncii_expartner', impersonated: null, persona_name: null, channel: 'social_dm', region: 'Mumbai', amount_band: null,
    hooks: ['ex-partner', 'posted on Instagram', 'threat to send to family'], one_line: 'An ex-partner posts intimate images on social platforms and threatens wider sharing' } },
  { category: 'social_impersonation', days: [1, 4, 8, 12, 18, 23, 28], sig: {
    modus: 'impersonation_profile', impersonated: 'the victim', persona_name: null, channel: 'social_dm', region: 'Kolkata', amount_band: null,
    hooks: ['cloned profile', 'urgent money request to friends'], one_line: 'A cloned Facebook or Instagram profile messages the victim\'s contacts asking for urgent money' } },
];

async function main(): Promise<void> {
  console.log('Resetting radar tables…');
  await db.delete(caseSignals);
  await db.delete(patterns);

  console.log(`Embedding + clustering ${SEEDS.reduce((a, s) => a + s.days.length, 0)} synthetic signals…`);
  const touched = new Set<string>();
  for (const seed of SEEDS) {
    const vec = await embedText(embeddingText(seed.sig));
    if (!vec) throw new Error('embedding failed');
    for (const d of seed.days) {
      // small jitter so signals aren't identical vectors
      const jitter = vec.map((x) => x + (Math.random() - 0.5) * 0.004);
      const [row] = await db.insert(caseSignals).values({
        caseId: null, modus: seed.sig.modus, impersonated: seed.sig.impersonated, personaName: seed.sig.persona_name,
        channel: seed.sig.channel, region: seed.sig.region, amountBand: seed.sig.amount_band, hooks: seed.sig.hooks,
        oneLine: seed.sig.one_line, category: seed.category, embedding: jitter, reportedAt: daysAgo(d),
      }).returning();
      const pid = await assignPattern(row.id, seed.sig, jitter, seed.category);
      touched.add(pid);
    }
  }
  console.log(`Writing briefs for ${touched.size} patterns…`);
  for (const pid of touched) {
    const p = await refreshPattern(pid);
    console.log(`  ${p?.reportCount} reports · ${p?.title}`);
  }

  console.log('Backfilling real registered cases…');
  const real = await db.select().from(cases).where(ne(cases.status, 'draft'));
  for (const c of real) {
    try { await radarIngest(c); console.log(`  ingested ${c.caseNumber}`); }
    catch (err) { console.warn(`  skip ${c.caseNumber}: ${(err as Error).message}`); }
  }
  await sql.end();
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
