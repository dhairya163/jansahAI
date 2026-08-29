import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { Doc, BasePage, Letterhead, T, s, C } from '../components.js';
import type { ArtifactData } from '../data.js';

/** §21 takedown_letter — one letter per platform (one page each). */
export function TakedownLetterPdf({ d }: { d: ArtifactData }) {
  const platforms = d.platforms.length > 0 ? d.platforms : ['(platform)'];
  const isImpersonation = d.c.category === 'social_impersonation';
  const contentLine = isImpersonation
    ? 'impersonates me / the person on whose behalf this complaint is made'
    : 'is non-consensual intimate imagery';
  return (
    <Doc title={`Takedown letters ${d.c.caseNumber} (Prototype)`}>
      {platforms.map((platform, idx) => (
        <BasePage key={idx}>
          <Letterhead
            caseNumber={d.c.caseNumber}
            title={`Grievance Officer Complaint — ${platform}`}
            titleHi="शिकायत अधिकारी को पत्र — 24 घंटे में हटाने का अनुरोध"
            date={d.dateStr}
            virtualNote={d.virtualNote}
          />
          <T style={s.p}>To: The Grievance Officer, {platform} (as published under the IT Rules 2021)</T>
          <Text style={s.p}>Subject: Complaint under Rule 3(2) — request for removal within 24 hours</Text>
          <Text style={s.p}>Sir/Madam,</Text>
          <Text style={s.p}>The following content {contentLine}:</Text>
          {d.urls.length > 0 ? d.urls.map((u, i) => (
            <T key={i} style={[s.p, { marginBottom: 2 }]}>• {u}</T>
          )) : <Text style={s.p}>• (URLs as listed in the annexed complaint)</Text>}
          {(d.slots.suspect_handles as string[] | undefined)?.length ? (
            <T style={s.p}>Offending account/handle(s): {(d.slots.suspect_handles as string[]).join(', ')}</T>
          ) : null}
          <Text style={s.p}>
            Under Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021, content of this class
            is to be removed within 24 hours of this complaint; acknowledgment is due within 24 hours and disposal within 15 days.
          </Text>
          <Text style={s.p}>
            Requested: (1) removal of the content above; (2) action on the uploading account(s); (3) preservation of associated
            records and logs for law-enforcement purposes.
          </Text>
          <T style={s.p}>Complainant reference: case {d.c.caseNumber}.{d.c.anonymous ? ' This complaint is filed anonymously; please correspond via the reference number.' : ''}</T>
          {!d.c.anonymous ? (
            <View style={s.sigBlock}>
              <T style={s.sigLine}>{d.c.reporterName ?? '—'}</T>
              <Text style={s.sigLine}>Date: {d.dateStr}</Text>
            </View>
          ) : null}
        </BasePage>
      ))}
    </Doc>
  );
}

/** §21 certin_email — plain-text incident email the user sends themselves. */
export function CertinEmailPdf({ d }: { d: ArtifactData }) {
  return (
    <Doc title={`CERT-In incident email ${d.c.caseNumber} (Prototype)`}>
      <BasePage>
        <Letterhead
          caseNumber={d.c.caseNumber}
          title="CERT-In Incident Email (copy & send from your own mailbox)"
          titleHi="CERT-In incident ईमेल (अपने मेलबॉक्स से भेजें)"
          date={d.dateStr}
          virtualNote={d.virtualNote}
        />
        <View style={{ backgroundColor: C.paper1, borderWidth: 1, borderColor: C.line, borderRadius: 5, padding: 12 }}>
          <Text style={{ fontSize: 9, lineHeight: 1.6 }}>{d.certinBody}</Text>
        </View>
        <View style={[s.callout, { marginTop: 12 }]}>
          <Text>
            CERT-In is India's national incident response team (incident@cert-in.org.in · 1800-11-4949). This prototype never
            emails authorities — copy the text above into your own email client and send it yourself.
          </Text>
        </View>
      </BasePage>
    </Doc>
  );
}

/** §21 gac_note — half-pager on the GAC appeal path. */
export function GacNotePdf({ d }: { d: ArtifactData }) {
  return (
    <Doc title={`GAC appeal note ${d.c.caseNumber} (Prototype)`}>
      <BasePage>
        <Letterhead
          caseNumber={d.c.caseNumber}
          title="Appealing to the Grievance Appellate Committee (GAC)"
          titleHi="Grievance Appellate Committee (GAC) में अपील"
          date={d.dateStr}
          virtualNote={d.virtualNote}
        />
        <Text style={s.h2}>What the GAC is</Text>
        <Text style={s.p}>
          The Grievance Appellate Committee (gac.gov.in) is the government's appellate body over platform Grievance Officers,
          created under Rule 3A of the IT Rules 2021. If a platform's Grievance Officer does not resolve your complaint in
          15 days (or resolves it unsatisfactorily), you may appeal online within 30 days of the platform's response — or of
          the 15-day deadline passing in silence.
        </Text>
        <Text style={s.h2}>What to attach</Text>
        <Text style={s.p}>
          1. Your takedown letter to the platform's Grievance Officer (in your case file).{'\n'}
          2. Proof of sending (email copy, in-app complaint reference, date).{'\n'}
          3. Proof the content is still up (fresh screenshots with visible URL and date), or the unsatisfactory response.
        </Text>
        <Text style={s.h2}>Timeline</Text>
        <T style={s.p}>
          Complaint filed with platform: on/around {d.registeredDateStr}. 15-day disposal deadline: {d.shoAppDateStr}.
          Your 30-day appeal window runs from the platform's response or from that deadline.
        </T>
      </BasePage>
    </Doc>
  );
}

/** §21 restoration_request — MRM-style money-restoration request. */
export function RestorationRequestPdf({ d }: { d: ArtifactData }) {
  return (
    <Doc title={`Restoration request ${d.c.caseNumber} (Prototype)`}>
      <BasePage>
        <Letterhead
          caseNumber={d.c.caseNumber}
          title="Money Restoration Request (MRM-style)"
          titleHi="धन-वापसी अनुरोध (MRM शैली)"
          date={d.dateStr}
          virtualNote={d.virtualNote}
        />
        <Text style={s.p}>
          Request for restoration of amounts held in beneficiary account(s), keyed to national cybercrime acknowledgment number.
        </Text>
        <View style={{ marginTop: 4 }}>
          <T style={s.p}>• Acknowledgment / case number: {d.c.caseNumber}</T>
          <T style={s.p}>• Amount held: {d.heldAmount ?? '(as confirmed by the freeze chain)'}{d.heldConfirmedAt ? `, confirmed on ${d.heldConfirmedAt}` : ''}</T>
          <T style={s.p}>• Total reported loss: {d.amountStr} ({d.amountWords})</T>
          <T style={s.p}>• Beneficiary details: as per the annexed complaint ({d.identifiers.map((i) => i.value).slice(0, 3).join(', ') || '—'})</T>
          <T style={s.p}>• Restoration sought to: the source account(s) from which the transfers were made ({String(d.slots.own_bank ?? '—')})</T>
        </View>
        <Text style={s.h2}>Note on court-ordered release</Text>
        <Text style={s.p}>
          Where a court order is required for de-freezing, District Legal Services Authorities (DLSA) / Lok Adalats increasingly
          process such refunds without a lawyer — ask the investigating officer to route the request via the DLSA, or approach the
          DLSA front office with this document and the annexed complaint. The Supreme Court (In re: Victims of Digital Arrest,
          Aug 2026) has directed a national SOP and state-level money-restoration systems.
        </Text>
        {!d.c.anonymous ? (
          <View style={s.sigBlock}>
            <T style={s.sigLine}>{d.c.reporterName ?? '—'}</T>
            <Text style={s.sigLine}>Date: {d.dateStr}</Text>
          </View>
        ) : null}
      </BasePage>
    </Doc>
  );
}
