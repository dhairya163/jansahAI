import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { Doc, BasePage, Letterhead, Table, T, s } from '../components.js';
import type { ArtifactData } from '../data.js';

/** §21 bank_notice — RBI limited-liability dispute letter, full liability table embedded (§7.1). */

export function BankNoticePdf({ d }: { d: ArtifactData }) {
  const bank = String(d.slots.own_bank ?? '—');
  const name = d.c.reporterName ?? '—';
  return (
    <Doc title={`Bank dispute notice ${d.c.caseNumber} (Prototype)`}>
      <BasePage>
        <Letterhead
          caseNumber={d.c.caseNumber}
          title="Dispute of Unauthorised Electronic Transactions"
          titleHi="अनधिकृत इलेक्ट्रॉनिक लेन-देन की शिकायत — बैंक को सूचना"
          date={d.dateStr}
          virtualNote={d.virtualNote}
        />
        <T style={s.p}>To: The Branch Manager / Nodal Officer, {bank}</T>
        <Text style={s.p}>
          Subject: Dispute of unauthorised electronic transactions — request for action under the RBI limited-liability framework
        </Text>
        <Text style={s.p}>Sir/Madam,</Text>
        <T style={s.p}>
          I hold an account with your bank. On {String(d.slots.incident_at ?? '—')}, the following unauthorised/fraud-induced transactions occurred:
        </T>
        <Table
          head={['#', 'Reference', 'Amount', 'Method', 'Time']}
          widths={[0.5, 2.2, 1.2, 1, 1.6]}
          rows={d.txns.length > 0
            ? d.txns.map((t, i) => [String(i + 1), t.ref ?? '—', `Rs ${t.amount.toLocaleString('en-IN')}`, t.method ?? '—', t.at ?? '—'])
            : [['1', '—', d.amountStr.replace('₹', 'Rs '), String(d.slots.instrument ?? '—'), String(d.slots.incident_at ?? '—')]]}
        />
        <Text style={s.p}>
          I am reporting within {String(Math.max(0, d.daysSince))} working day(s) of knowledge of these transactions. Under the RBI framework on
          Customer Protection – Limiting Liability of Customers in Unauthorised Electronic Banking Transactions (circular dated 06.07.2017 and successors):
        </Text>
        <Text style={s.p}>
          (a) unauthorised transactions reported in a timely manner carry zero customer liability;{'\n'}
          (b) shadow credit is to be afforded within 10 working days of notification;{'\n'}
          (c) the complaint is to be resolved within 90 days.
        </Text>
        <Text style={[s.small, { fontWeight: 700, marginTop: 4, marginBottom: 2 }]}>RBI limited-liability table (for reference)</Text>
        <Table
          head={['Reported within', 'Customer liability']}
          widths={[1.4, 3]}
          rows={[
            ['3 working days', 'Zero liability (where the deficiency lies neither with the bank nor the customer)'],
            ['4–7 working days', 'Capped: Rs 5,000 (BSBD accounts); Rs 10,000 (other savings accounts, prepaid instruments/gift cards, MSME current/CC/OD, credit cards with limit up to Rs 5 lakh); Rs 25,000 (other current/CC/OD accounts, credit cards with limit above Rs 5 lakh)'],
            ['Beyond 7 working days', "As per the bank's board-approved policy"],
          ]}
        />
        <Text style={s.p}>I request:</Text>
        <Text style={s.p}>
          1. immediate blocking of further debits on the affected instrument;{'\n'}
          2. registration of this dispute with a written acknowledgment and reference number;{'\n'}
          3. an immediate recall/hold request to the beneficiary bank; and{'\n'}
          4. written status within 10 working days.
        </Text>
        <T style={s.p}>
          National cybercrime complaint no. {d.c.caseNumber} is annexed (complaint PDF).
        </T>
        <View style={s.sigBlock}>
          <T style={s.sigLine}>Sincerely, {name}</T>
          <Text style={s.sigLine}>Date: {d.dateStr}</Text>
        </View>
      </BasePage>
    </Doc>
  );
}
