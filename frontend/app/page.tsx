import Link from 'next/link';
import { DisclaimerStrip, Nav, LangRibbon, MicIcon } from '@/components/chrome';
import { Reveal } from '@/components/Reveal';

/**
 * Landing — long-scroll product page. Every feature is shown with the real screen,
 * in the Jansah kit tokens; big type, generous air, one idea per section.
 */

function Shot({ src, alt, priority = false, ratio = '1280 / 800' }: { src: string; alt: string; priority?: boolean; ratio?: string }) {
  return (
    <div className="shot" style={{ aspectRatio: ratio }}>
      <div className="shot-bar"><i /><i /><i /></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" />
    </div>
  );
}

function Feature({ eyebrow, title, body, bullets, img, alt, flip = false, cta }: {
  eyebrow: string; title: string; body: string; bullets?: string[]; img: string; alt: string; flip?: boolean; cta?: { href: string; label: string };
}) {
  return (
    <section className="feature">
      <div className={`wrap feature-grid ${flip ? 'flip' : ''}`}>
        <Reveal className="feature-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="feature-title">{title}</h2>
          <p className="muted feature-body">{body}</p>
          {bullets && (
            <ul className="feature-list">{bullets.map((b) => <li key={b}>{b}</li>)}</ul>
          )}
          {cta && <Link className="dl" style={{ fontSize: 15, marginTop: 'var(--sp-4)' }} href={cta.href}>{cta.label} →</Link>}
        </Reveal>
        <Reveal delay={120} className="feature-shot"><Shot src={img} alt={alt} /></Reveal>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <DisclaimerStrip />
      <Nav />

      {/* ── hero ── */}
      <header className="hero">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <Reveal>
            <p className="eyebrow">Voice-first · Hindi, English, Hinglish and 8+ Indian languages</p>
            <h1 className="hero-title">Report a cybercrime<br />by talking.</h1>
            <p className="muted hero-sub">In your language, in one breath. Then Jansah does what no portal does — it pushes the case forward, day after day, with the documents attached.</p>
            <div className="hero-ctas">
              <Link className="btn btn-primary" style={{ padding: '0 var(--sp-8)' }} href="/call"><MicIcon /> Report by voice</Link>
              <Link className="btn" style={{ minHeight: 56 }} href="/call#callme">📞 No internet? We call you</Link>
              <Link className="btn" style={{ minHeight: 56 }} href="/track">Track my case</Link>
            </div>
            <div style={{ marginTop: 'var(--sp-6)' }}><LangRibbon pill /></div>
          </Reveal>
          <Reveal delay={150} style={{ marginTop: 'var(--sp-9)' }}>
            <Shot src="/features/call-live.png" alt="A live call: captions on the left, the complaint filling itself on the right" priority />
          </Reveal>
        </div>
      </header>

      {/* ── why ── */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <div className="stats">
              <div><p className="stat-n">3.24 crore</p><p className="stat-l">calls to the 1930 helpline last year — one every second</p></div>
              <div><p className="stat-n" style={{ color: 'var(--gerua-600)' }}>~1.4%</p><p className="stat-l">of complaints became FIRs. Without an FIR, nothing moves</p></div>
              <div><p className="stat-n">Day 15</p><p className="stat-l">is when a case quietly dies. It&apos;s also when Jansah calls you back</p></div>
            </div>
            <p className="muted" style={{ textAlign: 'center', marginTop: 'var(--sp-6)', fontSize: 17, maxWidth: '56ch', marginLeft: 'auto', marginRight: 'auto' }}>
              Intake exists. Follow-through didn&apos;t. Jansah is the follow-through — with a voice front door.
            </p>
          </Reveal>
        </div>
      </section>

      <Feature
        eyebrow="1 · Talk"
        title="Say what happened. The form fills itself."
        body="Speak the way you'd tell a friend — Hindi, English, Hinglish, Kannada, Tamil. Jansah classifies the crime, pulls out every detail from a single narration, and reads each number back digit by digit before it saves anything."
        bullets={['Live captions in your own script', 'Suspect numbers checked against prior reports while you talk', 'Aadhaar OTP and SMS arrive on screen — no real data needed']}
        img="/features/call-live.png" alt="Live call screen with captions and the slot sidebar"
      />
      <Feature flip
        eyebrow="2 · Documents"
        title="Your case file, ready before you hang up."
        body="A 14-digit case number, the complaint PDF, and the right action letter for your category — the RBI limited-liability bank notice, a 24-hour platform takedown, a CERT-In incident email. Bilingual, signed-ready, emailed to you."
        bullets={['Nine letter templates with the correct legal citations', 'Hindi and English on every page', 'Downloads only — you decide where they go']}
        img="/features/pdf-complaint.png" alt="The generated complaint PDF with Devanagari and English" 
      />
      <Feature
        eyebrow="3 · Lifecycle"
        title="One case number. The whole journey, in plain words."
        body="Registered, being worked, stalled, escalated, resolved. Every event lands on a timeline you can read without a lawyer — freezes, letters, clocks — and updates live as officials act."
        bullets={['Status by case number + OTP, no account needed', 'Next-step countdown: what happens, and when', 'Restoration request the moment money is held']}
        img="/features/case-day0.png" alt="Case page with the status stepper and timeline"
        cta={{ href: '/track?demo=1', label: 'Open a sample case' }}
      />
      <Feature flip
        eyebrow="4 · Follow-through"
        title="Day 15, no FIR? Your police application is ready."
        body="Statutory-style clocks run on every case. When it stalls — as most do — Jansah generates the SHO application pack, then the SP letter, then a magistrate draft, and emails each one to you the day it's due. The law's ladder, automated."
        bullets={['FIR pack cites Lalita Kumari, with a s.63 evidence certificate', 'Bank follow-up at day 7, RTI prompt at day 30', 'A demo time machine to see day 15 in minute 3']}
        img="/features/case-day15.png" alt="Case page at day 15: stalled, FIR pack ready, SP letter counting down"
      />
      <Feature
        eyebrow="5 · A person"
        title="Ask for a human, get a human."
        body="Say 'insaan se baat karni hai' at any point. The desk sees an AI-written brief before they say hello — so nobody repeats their story. On a phone call, the operator's replies are spoken to you by Jansah."
        bullets={['Never argues you out of it', 'Context handed over, not re-asked', 'Works the same on web and phone']}
        img="/features/call-handoff.png" alt="Call screen after a human from the desk joined the chat"
      />
      <Feature flip
        eyebrow="6 · Phone"
        title="No internet? We'll call you."
        body="Type your number, tap Call me. Your phone rings within seconds and you talk to the same agent on an ordinary call — no app, no data, no mic permissions. This page shows the transcript as you speak."
        bullets={['Same tools, same documents, same case number', 'Works on a feature phone', 'Consent-first: one call, only when you ask']}
        img="/features/call-phone.png" alt="The call page during a phone call: transcript streaming in from the phone"
        cta={{ href: '/call#callme', label: 'Try Call me' }}
      />
      <Feature
        eyebrow="7 · Scam radar"
        title="Every report makes the next victim harder to fool."
        body="Complaints are turned into anonymous pattern signatures and clustered. When many people describe the same scheme — 'a caller named Rahul, SBI KYC, Bengaluru' — it becomes a public warning, and Jansah tells the next caller they're not alone."
        bullets={['Counts, cities and trends — never a reporter', 'AI-written briefs in Hindi and English', '“Similar case reported 20 times in 30 days” — said live on the call']}
        img="/features/patterns.png" alt="The scam radar feed with pattern cards and trends"
        cta={{ href: '/patterns', label: 'See the radar' }}
      />

      {/* ── honesty ── */}
      <section className="band">
        <div className="wrap">
          <Reveal>
            <h2 style={{ fontSize: 30, textAlign: 'center' }}>Honest about what&apos;s real</h2>
            <div className="grid2" style={{ marginTop: 'var(--sp-6)', maxWidth: 880, marginLeft: 'auto', marginRight: 'auto' }}>
              <div className="card"><p style={{ fontSize: 14, fontWeight: 500, color: 'var(--neem-900)' }}>Real</p><p className="muted" style={{ fontSize: 14, marginTop: 4 }}>Voice AI, the case engine and every clock, all nine documents, emails to you, the phone line, the radar.</p></div>
              <div className="card" style={{ borderColor: 'var(--gerua-200)' }}><p style={{ fontSize: 14, fontWeight: 500, color: 'var(--gerua-800)' }}>Simulated</p><p className="muted" style={{ fontSize: 14, marginTop: 4 }}>Aadhaar OTP, the bank freeze chain, police and FIR marking, SMS. An officials console plays their part.</p></div>
            </div>
            <p style={{ textAlign: 'center', marginTop: 'var(--sp-6)' }}><Link className="dl" style={{ fontSize: 14 }} href="/about">The full honesty page →</Link></p>
          </Reveal>
        </div>
      </section>

      <footer className="wrap" style={{ paddingTop: 'var(--sp-8)', paddingBottom: 'var(--sp-10)', textAlign: 'center' }}>
        <Link className="btn btn-primary" style={{ padding: '0 var(--sp-8)' }} href="/call"><MicIcon /> Report by voice</Link>
        <p className="faint" style={{ fontSize: 12, marginTop: 'var(--sp-6)' }}>Jansah.AI · an independent builder prototype · not affiliated with any government body</p>
      </footer>

      <style>{`
        .eyebrow { font-size: 12px; letter-spacing: .09em; text-transform: uppercase; color: var(--neem-700); font-weight: 600; }
        .hero { padding: var(--sp-10) 0 var(--sp-9); }
        .hero-title { font-size: clamp(40px, 7vw, 76px); margin-top: var(--sp-4); letter-spacing: -.02em; line-height: 1.02; }
        .hero-sub { font-size: clamp(17px, 2vw, 21px); margin: var(--sp-5) auto 0; max-width: 46ch; }
        .hero-ctas { display: flex; gap: var(--sp-3); justify-content: center; flex-wrap: wrap; margin-top: var(--sp-7); }
        .band { background: var(--paper-1); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: var(--sp-10) 0; }
        .stats { display: grid; grid-template-columns: 1fr; gap: var(--sp-6); text-align: center; }
        .stat-n { font-family: var(--disp); font-weight: 600; font-size: clamp(32px, 4.5vw, 48px); letter-spacing: -.02em; line-height: 1; }
        .stat-l { color: var(--ink-2); font-size: 14px; margin-top: 8px; max-width: 30ch; margin-left: auto; margin-right: auto; }
        .feature { padding: var(--sp-11) 0; border-bottom: 1px solid var(--line); }
        .feature:last-of-type { border-bottom: 0; }
        .feature-grid { display: grid; grid-template-columns: 1fr; gap: var(--sp-7); align-items: center; }
        .feature-title { font-size: clamp(28px, 3.6vw, 42px); letter-spacing: -.02em; margin-top: var(--sp-3); max-width: 18ch; }
        .feature-body { font-size: 17px; margin-top: var(--sp-4); max-width: 46ch; }
        .feature-list { margin: var(--sp-4) 0 0; padding-left: 0; list-style: none; display: grid; gap: 8px; max-width: 46ch; }
        .feature-list li { padding-left: 22px; position: relative; font-size: 14.5px; color: var(--ink-2); }
        .feature-list li::before { content: ''; position: absolute; left: 0; top: 9px; width: 10px; height: 10px; border-radius: 50%; background: var(--neem-200); box-shadow: inset 0 0 0 3px var(--neem-700); }
        .shot { border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: var(--paper); box-shadow: 0 30px 60px -24px rgba(35,35,31,.28), 0 2px 8px rgba(35,35,31,.06); }
        .shot-bar { height: 26px; background: var(--paper-2); border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 6px; padding: 0 12px; }
        .shot-bar i { width: 8px; height: 8px; border-radius: 50%; background: var(--line-2); display: block; }
        .shot img { width: 100%; height: calc(100% - 26px); object-fit: cover; object-position: top; display: block; }
        .reveal { opacity: 0; transform: translateY(18px); transition: opacity .7s ease, transform .7s ease; }
        .reveal.in { opacity: 1; transform: none; }
        @media (min-width: 900px) {
          .stats { grid-template-columns: repeat(3, 1fr); }
          .feature-grid { grid-template-columns: 0.9fr 1.1fr; gap: var(--sp-10); }
          .feature-grid.flip .feature-copy { order: 2; }
          .feature-grid.flip .feature-shot { order: 1; }
        }
        @media (prefers-reduced-motion: reduce) { .reveal { opacity: 1; transform: none; transition: none; } }
      `}</style>
    </div>
  );
}
