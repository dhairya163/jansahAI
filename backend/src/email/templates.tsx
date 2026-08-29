import React from 'react';
import { Html, Head, Body, Container, Section, Text, Heading, Hr, Link, Preview } from '@react-email/components';
import { formatCaseNumber } from '../lib/ids.js';

/** §22 email templates — subject EN, body bilingual (EN + HI), prototype disclaimer everywhere. */

const colors = {
  ink: '#23231F', ink2: '#61605A', ink3: '#8B8A82',
  neem: '#0A5C4A', neemLight: '#E4F3ED',
  haldiLight: '#FBF0DA', haldiDark: '#6B4407',
  line: '#E3E1D8', paper: '#FFFFFF', paper1: '#F8F7F3',
};

const st = {
  body: { backgroundColor: '#F0EEE7', fontFamily: "'Public Sans','Noto Sans Devanagari',system-ui,Arial,sans-serif", margin: 0, padding: '24px 12px' },
  card: { backgroundColor: colors.paper, borderRadius: 12, border: `1px solid ${colors.line}`, maxWidth: 560, margin: '0 auto', padding: 28 },
  disclaimer: { backgroundColor: colors.haldiLight, color: colors.haldiDark, borderRadius: 8, padding: '8px 14px', fontSize: 12, lineHeight: '18px' },
  brand: { fontSize: 18, fontWeight: 700 as const, color: colors.ink, margin: '0 0 2px' },
  tag: { fontSize: 11, color: colors.ink3, margin: 0 },
  h: { fontSize: 20, fontWeight: 700 as const, color: colors.ink, margin: '18px 0 6px' },
  p: { fontSize: 14, lineHeight: '22px', color: colors.ink, margin: '8px 0' },
  pMuted: { fontSize: 13, lineHeight: '20px', color: colors.ink2, margin: '8px 0' },
  mono: { fontFamily: "'Spline Sans Mono',monospace", letterSpacing: 2, fontSize: 22, color: colors.ink, backgroundColor: colors.paper1, borderRadius: 8, padding: '10px 16px', display: 'inline-block' as const, border: `1px solid ${colors.line}` },
  callout: { backgroundColor: colors.neemLight, borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: '20px', color: '#04322A' },
  footer: { fontSize: 11, color: colors.ink3, lineHeight: '17px', margin: '14px 0 0' },
  btn: { backgroundColor: colors.neem, color: '#fff', borderRadius: 10, padding: '11px 20px', fontSize: 14, textDecoration: 'none', display: 'inline-block' as const },
};

export function Layout({ preview, children, trackUrl, caseNumber }: {
  preview: string; children: React.ReactNode; trackUrl?: string; caseNumber?: string;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={st.body}>
        <Container style={st.card}>
          <Section style={st.disclaimer}>
            Independent hackathon prototype. Not a government service. Demo data only. · यह एक स्वतंत्र प्रोटोटाइप है, सरकारी सेवा नहीं।
          </Section>
          <Section style={{ marginTop: 16 }}>
            <Text style={st.brand}>Jansah<span style={{ color: colors.neem }}>.AI</span></Text>
            <Text style={st.tag}>Janta ka Sahai · जनता का सहाई</Text>
          </Section>
          {children}
          {trackUrl && caseNumber ? (
            <Section style={{ marginTop: 18 }}>
              <Link href={trackUrl} style={st.btn}>Track case {formatCaseNumber(caseNumber)}</Link>
              <Text style={st.pMuted}>Tracking needs your case number + an OTP (demo OTP appears on screen). · स्थिति देखने के लिए केस नंबर + OTP चाहिए।</Text>
            </Section>
          ) : null}
          <Hr style={{ borderColor: colors.line, margin: '20px 0 0' }} />
          <Text style={st.footer}>
            Jansah.AI — an independent builder prototype; not affiliated with any government body, bank, or platform.
            Documents attached are drafts/downloads for you to review, sign, and submit yourself; this system never contacts
            any real authority. Demo data is purged after 7 days.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export interface CommonProps {
  caseNumber: string;
  categoryEn: string;
  categoryHi: string;
  trackUrl: string;
}

export function AckEmail(p: CommonProps & { guidance: { titleEn: string; bodyEn: string; titleHi: string; bodyHi: string }[]; financial: boolean }) {
  return (
    <Layout preview={`Complaint ${p.caseNumber} registered`} trackUrl={p.trackUrl} caseNumber={p.caseNumber}>
      <Heading style={st.h}>Complaint registered · शिकायत दर्ज</Heading>
      <Text style={st.p}>Your complaint (<b>{p.categoryEn}</b> · {p.categoryHi}) is registered. Save this case number:</Text>
      <Text style={st.mono}>{formatCaseNumber(p.caseNumber)}</Text>
      <Text style={st.p}>
        Attached: your complaint PDF{p.financial ? ' and the bank dispute notice (RBI limited-liability format) — sign it and submit it to your bank branch/email, and demand a written acknowledgment' : ''}.
      </Text>
      <Text style={st.pMuted}>
        संलग्न: आपकी शिकायत की PDF{p.financial ? ' और बैंक विवाद नोटिस — हस्ताक्षर कर बैंक में जमा करें और लिखित पावती माँगें' : ''}।
      </Text>
      <Heading as="h3" style={{ ...st.h, fontSize: 15 }}>What happens next · आगे क्या</Heading>
      {p.guidance.slice(0, 4).map((g, i) => (
        <Section key={i} style={{ marginBottom: 6 }}>
          <Text style={{ ...st.p, margin: '6px 0 0', fontWeight: 600 }}>{g.titleEn} · {g.titleHi}</Text>
          <Text style={{ ...st.pMuted, margin: '2px 0 0' }}>{g.bodyEn}</Text>
        </Section>
      ))}
    </Layout>
  );
}

export function StatusEmail(p: CommonProps & { statusEn: string; statusHi: string; lineEn: string; lineHi: string }) {
  return (
    <Layout preview={`Update on case ${p.caseNumber}: ${p.statusEn}`} trackUrl={p.trackUrl} caseNumber={p.caseNumber}>
      <Heading style={st.h}>{p.statusEn} · {p.statusHi}</Heading>
      <Text style={st.p}>{p.lineEn}</Text>
      <Text style={st.pMuted}>{p.lineHi}</Text>
    </Layout>
  );
}

export function NudgeEmail(p: CommonProps & { daysSince: number; attachedKindEn?: string }) {
  return (
    <Layout preview={`Case ${p.caseNumber}: no FIR yet — your police application is ready`} trackUrl={p.trackUrl} caseNumber={p.caseNumber}>
      <Heading style={st.h}>No FIR yet — your police application is ready</Heading>
      <Text style={st.p}>
        {p.daysSince} days have passed and no FIR is recorded against your complaint. This is unfortunately common — and you
        have a legal path. Attached is your ready-to-sign FIR application pack. Print, sign, submit at the jurisdictional cyber
        crime police station; keep the receipt. If nothing moves in 14 days, we'll prepare the SP escalation automatically.
      </Text>
      <Text style={st.pMuted}>
        {p.daysSince} दिन बीत गए और आपकी शिकायत पर FIR दर्ज नहीं हुई। यह आम बात है — और आपके पास कानूनी रास्ता है। तैयार FIR आवेदन
        पैक संलग्न है: प्रिंट करें, हस्ताक्षर करें, थाने में जमा करें, रसीद रखें। 14 दिनों में कुछ न हुआ तो SP को पत्र अपने आप तैयार होगा।
      </Text>
      <Section style={st.callout}>
        A portal complaint is not an FIR. Under Lalita Kumari v. State of U.P., registration is mandatory where a cognizable
        offence is disclosed — your pack cites it.
      </Section>
    </Layout>
  );
}

export function EscalationEmail(p: CommonProps & { level: 'SP' | 'Magistrate' }) {
  const isSP = p.level === 'SP';
  return (
    <Layout preview={`Case ${p.caseNumber}: escalation letter ready (${p.level})`} trackUrl={p.trackUrl} caseNumber={p.caseNumber}>
      <Heading style={st.h}>Escalation letter ready — {p.level}</Heading>
      <Text style={st.p}>
        {isSP
          ? 'Another 14 days passed without an FIR, so your written application to the Superintendent of Police is attached (BNSS s.173(4) route). Print, sign, submit to the district SP office; keep the receipt.'
          : "The SP route has also gone unanswered, so a draft application to the Magistrate is attached (BNSS s.175(3) route). It is a DRAFT — have a lawyer review it before filing."}
      </Text>
      <Text style={st.pMuted}>
        {isSP
          ? 'FIR के बिना 14 और दिन बीत गए, इसलिए पुलिस अधीक्षक (SP) को आपका लिखित आवेदन संलग्न है। प्रिंट, हस्ताक्षर, जमा करें; रसीद रखें।'
          : 'SP के रास्ते भी जवाब नहीं आया, इसलिए मजिस्ट्रेट के लिए मसौदा संलग्न है। यह केवल मसौदा है — दाखिल करने से पहले वकील से समीक्षा कराएँ।'}
      </Text>
    </Layout>
  );
}

export function RestorationEmail(p: CommonProps & { amountHeld: string }) {
  return (
    <Layout preview={`Good news on ${p.caseNumber}: ${p.amountHeld} is on hold`} trackUrl={p.trackUrl} caseNumber={p.caseNumber}>
      <Heading style={st.h}>Good news: {p.amountHeld} is on hold</Heading>
      <Text style={st.p}>
        The receiving bank has been asked to hold {p.amountHeld} (simulated freeze chain). A hold is not yet a refund — the
        attached restoration request is the next step, keyed to your 14-digit case number. Where a court order is needed,
        DLSA/Lok Adalat routes increasingly process these without a lawyer.
      </Text>
      <Text style={st.pMuted}>
        प्राप्तकर्ता बैंक से {p.amountHeld} रोकने को कहा गया है (सिम्युलेटेड)। होल्ड अभी रिफंड नहीं है — संलग्न धन-वापसी अनुरोध अगला
        कदम है, आपके 14-अंकों के केस नंबर से जुड़ा।
      </Text>
    </Layout>
  );
}
