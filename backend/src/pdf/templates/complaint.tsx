import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { Doc, BasePage, Letterhead, KV, Table, T, s, C } from '../components.js';
import type { ArtifactData } from '../data.js';

/** §21 complaint_pdf — "Cybercrime Complaint (Prototype)". */

export function ComplaintBody({ d, annexure }: { d: ArtifactData; annexure?: boolean }) {
  const { c } = d;
  return (
    <View>
      {c.anonymous ? (
        <View style={s.callout}>
          <Text style={{ fontWeight: 700 }}>ANONYMOUS COMPLAINT</Text>
          <Text>The women/children track permits anonymous filing; no identity details were collected, by design.</Text>
        </View>
      ) : (
        <View style={{ marginBottom: 8 }}>
          <Text style={s.h2}>Complainant / शिकायतकर्ता</Text>
          <KV label="Name" value={c.reporterName ?? '—'} />
          {c.onBehalfOf ? <KV label="Filing on behalf of" value={c.victimName ?? '—'} /> : null}
          <KV label="Phone" value={c.phoneMasked ?? '—'} mono />
          <KV label="Email" value={c.email ?? '—'} />
          <KV label="Identity" value={c.aadhaarLast4 ? `Aadhaar ••••••••${c.aadhaarLast4} (mock OTP verified)` : 'Not verified'} />
        </View>
      )}

      <Text style={s.h2}>Category / श्रेणी</Text>
      <KV label="Category" value={`${d.catLabel.en} · ${d.catLabel.hi}`} />
      <KV label="Track" value={`${d.trackLabel.en}`} />
      <KV label="Incident date/time" value={String(d.slots.incident_at ?? d.slots.when ?? d.slots.first_seen_at ?? '—')} />

      <Text style={s.h2}>Chronology of events / घटनाक्रम</Text>
      {d.narrative ? <T style={s.p}>{d.narrative}</T> : <Text style={s.p}>—</Text>}
      {d.narrativeEn ? (
        <View style={{ marginTop: 2 }}>
          <Text style={[s.small, { fontWeight: 700, marginBottom: 2 }]}>English rendering</Text>
          <Text style={s.p}>{d.narrativeEn}</Text>
        </View>
      ) : null}

      {d.txns.length > 0 ? (
        <View>
          <Text style={s.h2}>Transactions / लेन-देन</Text>
          <Table
            head={['#', 'Reference', 'Amount', 'Method', 'Time']}
            widths={[0.5, 2.2, 1.2, 1, 1.6]}
            rows={d.txns.map((t, i) => [String(i + 1), t.ref ?? '—', `Rs ${t.amount.toLocaleString('en-IN')}`, t.method ?? '—', t.at ?? '—'])}
          />
        </View>
      ) : null}

      {d.identifiers.length > 0 ? (
        <View>
          <Text style={s.h2}>Identifiers involved / संबंधित पहचानकर्ता</Text>
          <Table
            head={['Type', 'Value']}
            widths={[1, 3.4]}
            rows={d.identifiers.map((i) => [i.kind, i.value])}
          />
        </View>
      ) : null}

      {d.suspectMatches.length > 0 ? (
        <View style={[s.callout, { backgroundColor: C.geruaLight, color: C.gerua }]}>
          <Text style={{ fontWeight: 700, color: C.gerua }}>Suspect repository note (simulated repository)</Text>
          {d.suspectMatches.map((m, i) => (
            <Text key={i} style={{ color: C.gerua }}>• {m.value} — reported {m.matches} time(s) previously</Text>
          ))}
        </View>
      ) : null}

      {d.c.amountLost !== null ? (
        <View>
          <Text style={s.h2}>Loss amount / हानि राशि</Text>
          <KV label="In figures" value={d.amountStr} />
          <KV label="In words" value={d.amountWords} />
        </View>
      ) : null}

      <Text style={s.h2}>Evidence in complainant's possession / उपलब्ध साक्ष्य</Text>
      {d.evidence.map((e, i) => (
        <T key={i} style={[s.p, { marginBottom: 2, fontSize: 8.8 }]}>• {e.description}  ({e.source}; noted {e.capturedAt}{e.hash ? `; SHA-256 ${e.hash}` : ''})</T>
      ))}

      {!annexure ? (
        <View>
          <Text style={s.h2}>Declaration / घोषणा</Text>
          <Text style={s.p}>
            I state that the above information is true to my knowledge. I understand this prototype document is for demonstration and personal record.
          </Text>
          <Text style={s.pHi}>
            मैं घोषणा करता/करती हूँ कि उपरोक्त जानकारी मेरी जानकारी के अनुसार सत्य है। मैं समझता/समझती हूँ कि यह प्रोटोटाइप दस्तावेज़ केवल प्रदर्शन और व्यक्तिगत रिकॉर्ड के लिए है।
          </Text>
          <View style={s.sigBlock}>
            <Text style={s.sigLine}>Signature / हस्ताक्षर</Text>
            <Text style={s.sigLine}>Date / दिनांक</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function ComplaintPdf({ d }: { d: ArtifactData }) {
  return (
    <Doc title={`Cybercrime Complaint ${d.c.caseNumber} (Prototype)`}>
      <BasePage>
        <Letterhead
          caseNumber={d.c.caseNumber}
          title="Cybercrime Complaint (Prototype)"
          titleHi="साइबर अपराध शिकायत (प्रोटोटाइप)"
          date={d.dateTimeStr}
          virtualNote={d.virtualNote}
        />
        <ComplaintBody d={d} />
      </BasePage>
    </Doc>
  );
}
