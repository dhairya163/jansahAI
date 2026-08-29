import Link from 'next/link';
import { DisclaimerStrip, Nav, LangRibbon, MicIcon, FooterNote } from '@/components/chrome';

/** §12.1 landing — hero, 3 steps, real-vs-simulated, language line. Page weight < 200KB, no images/video. */
export default function Landing() {
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <DisclaimerStrip />
      <Nav />

      <div className="wrap" style={{ paddingTop: 'var(--sp-9)', paddingBottom: 'var(--sp-10)' }}>
        <div style={{ display: 'grid', gap: 'var(--sp-8)', gridTemplateColumns: '1fr', alignItems: 'center' }} className="hero-grid">
          <div>
            <h1 style={{ fontSize: 'clamp(34px, 6vw, 52px)' }}>Report a cybercrime<br />by talking.</h1>
            <p className="muted" style={{ fontSize: 18, marginTop: 'var(--sp-4)', maxWidth: '44ch' }}>
              In your language. Then Jansah pushes it forward — the bank notice on day 0,
              the FIR pack on day 15, escalation letters on time.
            </p>
            <div style={{ display: 'flex', gap: 'var(--sp-4)', marginTop: 'var(--sp-7)', flexWrap: 'wrap' }}>
              <Link className="btn btn-primary" style={{ padding: '0 var(--sp-8)' }} href="/call">
                <MicIcon /> Report by voice
              </Link>
              <Link className="btn" style={{ minHeight: 56 }} href="/track">Track my case</Link>
            </div>
            <div style={{ marginTop: 'var(--sp-6)' }}><LangRibbon pill /></div>
          </div>
          <div className="card" style={{ padding: 'var(--sp-6)', background: 'var(--paper-1)' }}>
            <p className="faint" style={{ fontSize: 12 }}>Why this exists</p>
            <p className="disp" style={{ fontSize: 26, marginTop: 'var(--sp-2)' }}>
              3.24 crore calls to 1930 last year.<br />
              <span style={{ color: 'var(--gerua-600)' }}>~1.4%</span> became FIRs.
            </p>
            <p className="muted" style={{ fontSize: 14, marginTop: 'var(--sp-3)' }}>
              Intake exists. Follow-through didn&apos;t. Jansah calls you back on day 15 — with the documents attached.
            </p>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--paper-1)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap" style={{ paddingTop: 'var(--sp-9)', paddingBottom: 'var(--sp-9)' }}>
          <div className="grid3">
            <div className="card">
              <span className="chip chip-neem">1</span>
              <p style={{ fontWeight: 500, marginTop: 'var(--sp-3)' }}>Talk</p>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                The complaint fills itself as you speak — every number read back digit by digit.
              </p>
            </div>
            <div className="card">
              <span className="chip chip-neem">2</span>
              <p style={{ fontWeight: 500, marginTop: 'var(--sp-3)' }}>Get your documents</p>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                Case number, complaint PDF, and the right action letter for your category — instantly.
              </p>
            </div>
            <div className="card">
              <span className="chip chip-neem">3</span>
              <p style={{ fontWeight: 500, marginTop: 'var(--sp-3)' }}>We chase it</p>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                Clocks run. Day-15 FIR pack, SP letter, magistrate draft — emailed, ready to sign.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="wrap" style={{ paddingTop: 'var(--sp-9)', paddingBottom: 'var(--sp-10)' }}>
        <div className="grid2">
          <div className="card">
            <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--neem-900)' }}>Real</p>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Voice AI, case engine, clocks, PDFs, emails.</p>
          </div>
          <div className="card" style={{ borderColor: 'var(--gerua-200)' }}>
            <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--gerua-800)' }}>Simulated</p>
            <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Aadhaar OTP, freeze chain, bank, police, SMS.</p>
          </div>
        </div>
        <FooterNote />
      </div>

      <style>{`@media (min-width: 900px) { .hero-grid { grid-template-columns: 1.1fr .9fr !important; gap: var(--sp-10) !important; } }`}</style>
    </div>
  );
}
