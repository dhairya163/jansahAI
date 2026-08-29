import { eq, isNull, and } from 'drizzle-orm';
import { db, sql } from '../src/db/client.js';
import { cases, suspects, caseEvents, type CaseRow } from '../src/db/schema.js';
import { registerCase } from '../src/engine/register.js';
import { addEvent } from '../src/engine/events.js';
import { advanceTime } from '../src/engine/clocks.js';
import { generateArtifact } from '../src/pdf/render.js';
import { formatINR } from '../src/lib/normalize.js';

/** §27 seed data: suspect repository + 4 closed financial cases + demo personas (Ravi/Sunita/Anon variants). */

async function wipeSeed(): Promise<void> {
  console.log('Clearing previous seed…');
  await db.delete(cases).where(eq(cases.keepForDemo, true));
  await db.delete(suspects).where(isNull(suspects.caseId));
}

async function mkClosedCase(n: number, category: string, amount: number): Promise<CaseRow> {
  const [c] = await db.insert(cases).values({
    caseNumber: `2026070${n}00${100 + n}`.padEnd(14, '0').slice(0, 14),
    track: 'financial', category, status: 'closed',
    language: 'hi-en', reporterName: `Seeded complainant ${n}`,
    amountLost: String(amount),
    slots: { narrative: `Seeded closed case ${n} for suspect-repository matches.` },
    keepForDemo: true,
    registeredAt: new Date(Date.now() - (30 + n) * 86_400_000),
  }).returning();
  await addEvent(c.id, 'note', 'system', { text: 'Seeded historical case (for suspect matches).' });
  return c;
}

async function mkDraft(v: Partial<typeof cases.$inferInsert>): Promise<CaseRow> {
  const [c] = await db.insert(cases).values({
    caseNumber: `draft-seed-${Math.random().toString(36).slice(2, 10)}`,
    track: 'other', category: 'unclassified', status: 'draft',
    keepForDemo: true,
    ...v,
  }).returning();
  return c;
}

async function seedRavi(dayOffset: 0 | 15, persona: string): Promise<void> {
  const c = await mkDraft({
    track: 'financial', category: 'financial_upi', language: 'hi-en',
    reporterName: 'Ravi Kumar', victimName: 'Ravi Kumar',
    phoneMasked: '+91••••••7841', aadhaarLast4: '7841',
    amountLost: '48000', incidentAt: new Date(),
    slots: {
      demo_persona: persona,
      amount: 48000,
      incident_at: 'Today, 9:42 pm',
      instrument: 'upi',
      txns: [
        { ref: 'UPI-417238991201', amount: 30000, at: '9:42 pm', method: 'upi' },
        { ref: 'UPI-417238991388', amount: 18000, at: '9:47 pm', method: 'upi' },
      ],
      payee_identifier: 'quickhelp.desk@okpay',
      own_bank: 'State Bank of India',
      suspect_contacts: [{ kind: 'phone', value: '+919812554401' }],
      narrative:
        'Parcel wala call aaya tha — bola customs mein mere naam ka parcel pakda gaya hai, drugs mila hai. ' +
        'Unhone bola verification fee bharni hogi warna arrest ho jayegi. Dar ke maare maine do UPI transfer kar diye, ' +
        'pehla 30 hazaar ka aur doosra 18 hazaar ka, quickhelp.desk@okpay par. 20 minute baad samajh aaya ki scam tha.',
    },
  });
  await addEvent(c.id, 'identity_verified', 'agent', { aadhaar_last4: '7841' });
  const [fresh] = await db.select().from(cases).where(eq(cases.id, c.id));
  await registerCase(fresh!, { identityVerified: true, sync: true });

  if (dayOffset === 15) {
    // demo arc: freeze confirmed ₹31,000 on day 2, then day 15 → stalled + FIR pack
    await advanceTime(c.id, 2);
    await db.update(cases).set({ amountHeld: '31000', substatus: `${formatINR(31000)} held at beneficiary bank` }).where(eq(cases.id, c.id));
    await addEvent(c.id, 'freeze_confirmed', 'ops', { amount_held: 31000 });
    await addEvent(c.id, 'restoration_offered', 'ops', { amount_held: 31000 });
    const [c2] = await db.select().from(cases).where(eq(cases.id, c.id));
    await generateArtifact(c2!, 'restoration_request');
    await advanceTime(c.id, 13);
  }
  const [done] = await db.select().from(cases).where(eq(cases.id, c.id));
  console.log(`  Ravi (${persona}): ${done!.caseNumber} status=${done!.status}`);
}

async function seedSunita(): Promise<void> {
  const c = await mkDraft({
    track: 'other', category: 'digital_arrest_no_loss', language: 'hi',
    reporterName: 'Sunita Devi', victimName: 'Sunita Devi',
    phoneMasked: '+91••••••3310', aadhaarLast4: '3310',
    slots: {
      demo_persona: 'sunita_day0',
      caller_claims: 'CBI officer bola, WhatsApp video par 40 minute custody mein rakha, warrant dikhaya, paise maange',
      numbers: ['+917000221199', '+919812554401'],
      narrative:
        'व्हाट्सऐप वीडियो कॉल पर एक आदमी ने खुद को सीबीआई अधिकारी बताया। कहा मेरे आधार से मनी लॉन्ड्रिंग हुई है और मुझे ' +
        'डिजिटल अरेस्ट में रहना होगा। चालीस मिनट तक कैमरे के सामने बिठाए रखा और वेरिफिकेशन के नाम पर पैसे माँगे। ' +
        'मैंने बेटी की मदद से कॉल काट दी — कोई पैसा नहीं भेजा।',
    },
  });
  await addEvent(c.id, 'identity_verified', 'agent', { aadhaar_last4: '3310' });
  const [fresh] = await db.select().from(cases).where(eq(cases.id, c.id));
  await registerCase(fresh!, { identityVerified: true, sync: true });
  const [done] = await db.select().from(cases).where(eq(cases.id, c.id));
  console.log(`  Sunita: ${done!.caseNumber} status=${done!.status}`);
}

async function seedAnonNcii(dayOffset: 0 | 15, persona: string): Promise<void> {
  const c = await mkDraft({
    track: 'women_children', category: 'wc_ncii', language: 'en', anonymous: true,
    slots: {
      demo_persona: persona,
      platforms: ['Instagram', 'Facebook'],
      urls: ['https://instagram.com/p/xk29fake', 'https://facebook.com/permalink/88231fake'],
      first_seen_at: 'Three days ago',
      suspect_handles: ['@rk_2291_fake'],
      narrative:
        'An ex-partner has posted intimate images of me on two platforms without my consent and is threatening to share more. ' +
        'The images are visible on the profile links provided. I want them taken down and the accounts actioned.',
    },
  });
  await addEvent(c.id, 'identity_skipped_anonymous', 'agent', {});
  const [fresh] = await db.select().from(cases).where(eq(cases.id, c.id));
  await registerCase(fresh!, { identityVerified: false, sync: true });
  if (dayOffset === 15) await advanceTime(c.id, 15);
  const [done] = await db.select().from(cases).where(eq(cases.id, c.id));
  console.log(`  Anon NCII (${persona}): ${done!.caseNumber} status=${done!.status}`);
}

async function main(): Promise<void> {
  await wipeSeed();

  console.log('Seeding closed financial cases + suspect repository…');
  const closed = [
    await mkClosedCase(1, 'financial_upi', 22000),
    await mkClosedCase(2, 'financial_courier_customs', 61000),
    await mkClosedCase(3, 'financial_upi', 15500),
    await mkClosedCase(4, 'financial_investment', 320000),
  ];
  // quickhelp.desk@okpay attached to 3 seeded closed cases → Ravi's check returns 3 prior reports (§27)
  for (const cc of closed.slice(0, 3)) {
    await db.insert(suspects).values({ caseId: cc.id, kind: 'upi', valueNorm: 'quickhelp.desk@okpay' });
  }
  await db.insert(suspects).values([
    { caseId: null, kind: 'upi', valueNorm: 'refund.support@paytmz' },
    { caseId: closed[0].id, kind: 'phone', valueNorm: '+919812554401' },
    { caseId: closed[1].id, kind: 'phone', valueNorm: '+919812554401' },
    { caseId: null, kind: 'phone', valueNorm: '+917000221199' },
    { caseId: null, kind: 'url', valueNorm: 'kyc-update-sbi.in' },
    { caseId: null, kind: 'email', valueNorm: 'claims@parcel-verify.org' },
  ]);

  console.log('Seeding demo personas (this generates real PDFs — takes a moment)…');
  await seedRavi(0, 'ravi_day0');
  await seedRavi(15, 'ravi_day15');
  await seedSunita();
  await seedAnonNcii(0, 'anon_ncii_day0');
  await seedAnonNcii(15, 'anon_ncii_day15');

  const all = await db.select().from(cases).where(and(eq(cases.keepForDemo, true)));
  console.log(`Seed complete: ${all.length} cases.`);
  await sql.end();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
