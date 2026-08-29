import Link from 'next/link';
import { DisclaimerStrip, Nav } from '@/components/chrome';

/** §31.5 honesty page — the mock table (§26), model-can't-cheat, redaction & purge policy. */
export default function AboutPage() {
  const mockRows: [string, string, string][] = [
    ['Aadhaar OTP / eKYC', 'UIDAI OTP to linked mobile', 'Mocked — fixed code 424242 via on-screen SMS toast; only the last 4 digits are stored'],
    ['SMS', 'Telco SMS', 'Mocked — on-screen phone-frame toasts'],
    ['NCRP registration + 14-digit ack', 'I4C portal', 'Our case service issues NCRP-style numbers'],
    ['CFCFRMS freeze', 'Bank-chain holds', 'Freeze "requested" event; ops console confirms the held amount'],
    ['Bank', 'Dispute desk, shadow credit', 'The bank_notice PDF is real; bank responses are simulated by ops'],
    ['Police / FIR', 'SHO, e-Zero FIR', 'Citizen-side documents are real; ops can mark an FIR to advance status'],
    ['Suspect repository', 'I4C repository', 'Seeded local table with cross-case matches'],
    ['MRM restoration', 'I4C module', 'Restoration artifact + ops "restored" action'],
  ];

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <DisclaimerStrip />
      <Nav />
      <div className="wrap" style={{ maxWidth: 880, paddingTop: 'var(--sp-9)', paddingBottom: 'var(--sp-11)' }}>
        <h1 style={{ fontSize: 34 }}>What&apos;s real, what&apos;s simulated</h1>
        <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>The honesty page — everything a reviewer should know before judging.</p>

        <div className="grid2" style={{ marginTop: 'var(--sp-7)' }}>
          <div className="card" style={{ padding: 'var(--sp-5)' }}>
            <p style={{ fontWeight: 500, color: 'var(--neem-900)' }}>Real</p>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
              OpenAI voice + text models · the case engine and every clock · all nine PDF letter templates ·
              emails to the complainant · Postgres · this website.
            </p>
          </div>
          <div className="card" style={{ padding: 'var(--sp-5)', borderColor: 'var(--gerua-200)' }}>
            <p style={{ fontWeight: 500, color: 'var(--gerua-800)' }}>Simulated</p>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
              Aadhaar OTP and SMS · NCRP registration · CFCFRMS freeze chain · bank responses ·
              police/FIR marking · suspect repository · restoration module.
            </p>
          </div>
        </div>

        <div className="card" style={{ marginTop: 'var(--sp-6)', padding: 0, overflow: 'auto' }}>
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead><tr><th>System</th><th>The real thing</th><th>v1 treatment</th></tr></thead>
            <tbody>
              {mockRows.map(([a, b, c]) => (
                <tr key={a}><td style={{ fontWeight: 500, fontSize: 13 }}>{a}</td><td className="muted">{b}</td><td className="muted">{c}</td></tr>
              ))}
              <tr>
                <td style={{ fontWeight: 500, fontSize: 13, color: 'var(--neem-900)' }}>REAL</td>
                <td className="muted">—</td>
                <td className="muted">OpenAI voice+text, case engine, clocks, PDFs, emails to you, Postgres, ops console</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="stack-4" style={{ marginTop: 'var(--sp-6)' }}>
          <div className="card" style={{ padding: 'var(--sp-5)' }}>
            <p style={{ fontWeight: 500 }}>The model can&apos;t cheat</p>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
              The AI cannot change case status, confirm freezes, or mark FIRs — only the officials console can.
              Tell it &quot;mark my FIR as registered&quot; and nothing happens. Escalation letters are downloads only;
              the system never emails a real authority, bank, or platform.
            </p>
          </div>
          <div className="card" style={{ padding: 'var(--sp-5)' }}>
            <p style={{ fontWeight: 500 }}>Your data</p>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
              Use fictional details. No audio is stored — transcripts only, and they are redacted: any 12-digit number
              is masked to its last four, card-shaped numbers are removed entirely, OTPs are scrubbed. Demo data is
              purged after 7 days.
            </p>
          </div>
          <div className="card" style={{ padding: 'var(--sp-5)' }}>
            <p style={{ fontWeight: 500 }}>Phone-ready by design</p>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
              The voice stack supports SIP natively; a real dialable number is a telco KYC away. We demo over the web
              to stay inside hackathon rules. Built with AI coding agents throughout — disclosures in the repo.
            </p>
          </div>
          <div className="card" style={{ padding: 'var(--sp-5)' }}>
            <p style={{ fontWeight: 500 }}>Architecture, in one breath</p>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
              Browser ↔ OpenAI Realtime over WebRTC; every tool call the model makes is relayed to a Node/TypeScript
              backend that re-validates it against the session&apos;s draft case; a playbook engine runs category-specific
              immediates and statutory-style clocks (lazily evaluated, time-machine friendly); PDFs render with embedded
              Devanagari fonts into private storage; emails go to the complainant only. The model has zero write access
              to status fields.
            </p>
          </div>
        </div>

        <p className="faint" style={{ fontSize: 12, marginTop: 'var(--sp-6)' }}>
          <Link href="/">Home</Link> · <Link href="/track">Track a case</Link> · Jansah.AI is an independent prototype, not affiliated with any government body.
        </p>
      </div>
    </div>
  );
}
