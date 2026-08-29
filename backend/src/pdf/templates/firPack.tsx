import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { Doc, BasePage, Letterhead, T, s, C } from '../components.js';
import { ComplaintBody } from './complaint.js';
import type { ArtifactData } from '../data.js';

/** §21 fir_pack — 3 sections: SHO application · complaint annexure · evidence annexure with BSA s.63 certificate. */

const PS_PLACEHOLDER = 'Cyber Crime Police Station (jurisdictional)';

export function FirPackPdf({ d }: { d: ArtifactData }) {
  const name = d.c.anonymous ? '(Anonymous complainant — this track permits anonymity)' : (d.c.reporterName ?? '—');
  return (
    <Doc title={`FIR application pack ${d.c.caseNumber} (Prototype)`}>
      {/* Section 1 — Application to SHO */}
      <BasePage>
        <Letterhead
          caseNumber={d.c.caseNumber}
          title="Section 1 — Application to the Station House Officer"
          titleHi="धारा 1 — थाना प्रभारी (SHO) को आवेदन"
          date={d.dateStr}
          virtualNote={d.virtualNote}
        />
        <Text style={s.p}>To: The Station House Officer, {PS_PLACEHOLDER}</Text>
        <Text style={s.p}>Subject: Request to register FIR — cognizable offence(s) disclosed</Text>
        <Text style={s.p}>Respected Sir/Madam,</Text>
        <T style={s.p}>
          I filed national cybercrime complaint {d.c.caseNumber} on {d.registeredDateStr}; {String(d.daysSince)} days have passed
          without registration of an FIR. The annexed facts disclose cognizable offences (indicatively: {d.sections}).
        </T>
        <Text style={s.p}>
          Per the Constitution Bench in Lalita Kumari v. State of U.P., registration of an FIR is mandatory where the information
          discloses a cognizable offence, and any preliminary inquiry must be narrow and time-bound. I further note that under
          BNSS s.173(1), information may be given including by electronic communication.
        </Text>
        <Text style={s.p}>
          I request registration of an FIR and a copy of the FIR free of cost, and I am prepared to provide any statement required.
        </Text>
        <Text style={s.p}>List of annexures:</Text>
        <Text style={s.p}>
          Annexure A — Complaint (national portal acknowledgment {d.c.caseNumber}){'\n'}
          Annexure B — Evidence list with certificate under s.63, Bharatiya Sakshya Adhiniyam 2023
        </Text>
        <View style={s.sigBlock}>
          <T style={s.sigLine}>{name}</T>
          <Text style={s.sigLine}>Date: {d.dateStr}</Text>
        </View>
      </BasePage>

      {/* Section 2 — Complaint annexure */}
      <BasePage>
        <Letterhead
          caseNumber={d.c.caseNumber}
          title="Section 2 — Annexure A: Complaint"
          titleHi="धारा 2 — अनुलग्नक A: शिकायत"
          date={d.dateStr}
          virtualNote={d.virtualNote}
        />
        <ComplaintBody d={d} annexure />
      </BasePage>

      {/* Section 3 — Evidence annexure + BSA s.63 certificate */}
      <BasePage>
        <Letterhead
          caseNumber={d.c.caseNumber}
          title="Section 3 — Annexure B: Evidence list & s.63 BSA certificate"
          titleHi="धारा 3 — अनुलग्नक B: साक्ष्य सूची व BSA धारा 63 प्रमाणपत्र"
          date={d.dateStr}
          virtualNote={d.virtualNote}
        />
        <Text style={s.h2}>Itemised evidence list</Text>
        {d.evidence.map((e, i) => (
          <T key={i} style={[s.p, { marginBottom: 3, fontSize: 8.8 }]}>
            {String(i + 1)}. {e.description} — source: {e.source}; capture time: {e.capturedAt}; {e.hash ? `SHA-256: ${e.hash}` : 'described item — no file, listed unhashed'}
          </T>
        ))}
        <Text style={s.h2}>Certificate under s.63, Bharatiya Sakshya Adhiniyam 2023</Text>
        <Text style={[s.p, { fontSize: 8.8 }]}>
          I, ____________________________, state that the electronic records listed above were produced from the device(s)
          described below, which were used regularly to store or process such information, and that the records were produced
          in the ordinary course of the said activity, the device(s) operating properly at the material time. The contents are
          true to the best of my knowledge and belief.
        </Text>
        <Text style={[s.p, { fontSize: 8.8 }]}>
          Device(s) description: ______________________________________________{'\n'}
          Produced by (name): ______________________________________________{'\n'}
          Description of records: the itemised list above forms part of this certificate.
        </Text>
        <View style={s.sigBlock}>
          <Text style={s.sigLine}>Signature / हस्ताक्षर</Text>
          <Text style={s.sigLine}>Date / दिनांक</Text>
        </View>
        <View style={[s.callout, { marginTop: 14 }]}>
          <Text>
            How to use this pack: print all three sections, sign Sections 1 and 3, submit at the police station named above,
            and keep the receiving stamp/receipt. If nothing moves in 14 days, the SP escalation letter is prepared automatically.
          </Text>
        </View>
      </BasePage>
    </Doc>
  );
}

/** §21 sp_letter — escalation to the Superintendent of Police (BNSS s.173(4)). */
export function SpLetterPdf({ d }: { d: ArtifactData }) {
  const name = d.c.anonymous ? '(Anonymous complainant)' : (d.c.reporterName ?? '—');
  return (
    <Doc title={`SP escalation letter ${d.c.caseNumber} (Prototype)`}>
      <BasePage>
        <Letterhead
          caseNumber={d.c.caseNumber}
          title="Application to the Superintendent of Police"
          titleHi="पुलिस अधीक्षक को आवेदन"
          date={d.dateStr}
          virtualNote={d.virtualNote}
        />
        <Text style={s.p}>To: The Superintendent of Police (District)</Text>
        <Text style={s.p}>Subject: Non-registration of FIR despite disclosure of cognizable offence — request for action under BNSS s.173(4)</Text>
        <Text style={s.p}>Respected Sir/Madam,</Text>
        <T style={s.p}>
          I filed national cybercrime complaint {d.c.caseNumber} on {d.registeredDateStr}. On {d.shoAppDateStr}, I submitted a written
          application to the Station House Officer, {PS_PLACEHOLDER}, requesting registration of an FIR (copy annexed). No FIR has been
          registered to date — {String(d.daysSince)} days since the complaint.
        </T>
        <Text style={s.p}>
          The facts disclose cognizable offences (indicatively: {d.sections}). Under BNSS s.173(4) (corresponding to s.154(3) CrPC),
          where an officer in charge refuses or fails to record such information, the aggrieved person may send the substance of the
          information to the Superintendent of Police, who may investigate the case personally or direct an investigation.
        </Text>
        <Text style={s.p}>
          I request that you direct the registration of an FIR and investigation, and inform me of the action taken.
        </Text>
        <Text style={s.p}>Annexure: FIR application pack (SHO application + complaint + evidence annexure).</Text>
        <View style={s.sigBlock}>
          <T style={s.sigLine}>{name}</T>
          <Text style={s.sigLine}>Date: {d.dateStr}</Text>
        </View>
      </BasePage>
    </Doc>
  );
}

/** §21 magistrate_draft — DRAFT watermark, BNSS s.175(3) application. */
export function MagistrateDraftPdf({ d }: { d: ArtifactData }) {
  const name = d.c.anonymous ? '(Anonymous complainant)' : (d.c.reporterName ?? '—');
  return (
    <Doc title={`Magistrate application draft ${d.c.caseNumber} (Prototype)`}>
      <BasePage watermark="DRAFT">
        <Letterhead
          caseNumber={d.c.caseNumber}
          title="Application before the Magistrate (Draft)"
          titleHi="मजिस्ट्रेट के समक्ष आवेदन (मसौदा)"
          date={d.dateStr}
          virtualNote={d.virtualNote}
        />
        <View style={[s.callout, { backgroundColor: C.geruaLight }]}>
          <Text style={{ color: C.gerua, fontWeight: 700 }}>TEMPLATE — have a lawyer review before filing.</Text>
        </View>
        <Text style={s.p}>Before the Court of the Judicial Magistrate (First Class), ____________</Text>
        <Text style={s.p}>
          Application under s.175(3), Bharatiya Nagarik Suraksha Sanhita 2023 (corresponding to s.156(3) CrPC) — for a direction
          to the police to register an FIR and investigate
        </Text>
        <Text style={s.h2}>Chronology</Text>
        <T style={s.p}>
          1. On {d.registeredDateStr}, the applicant filed national cybercrime complaint {d.c.caseNumber} ({d.catLabel.en}).{'\n'}
          2. On {d.shoAppDateStr}, the applicant applied in writing to the Station House Officer, {PS_PLACEHOLDER}, for registration of an FIR. No FIR was registered.{'\n'}
          3. On {d.spLetterDateStr}, the applicant escalated in writing to the Superintendent of Police under BNSS s.173(4). No FIR has been registered to date.{'\n'}
          4. The facts disclose cognizable offences (indicatively: {d.sections}). Per Lalita Kumari v. State of U.P., registration is mandatory.
        </T>
        <Text style={s.h2}>Prayer</Text>
        <Text style={s.p}>
          In the premises, the applicant prays that this Hon'ble Court direct the officer in charge of the concerned police station
          to register an FIR on the applicant's information and investigate in accordance with law, and pass such further orders
          as deemed fit.
        </Text>
        <Text style={s.p}>Annexures: national portal complaint & acknowledgment; SHO application; SP application; evidence list with s.63 BSA certificate.</Text>
        <View style={s.sigBlock}>
          <T style={s.sigLine}>Applicant: {name}</T>
          <Text style={s.sigLine}>Date: {d.dateStr}</Text>
        </View>
      </BasePage>
    </Doc>
  );
}
