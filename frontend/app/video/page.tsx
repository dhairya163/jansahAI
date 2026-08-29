import Link from 'next/link';
import { DisclaimerStrip, Nav, MicIcon } from '@/components/chrome';

export const metadata = { title: 'Jansah.AI — Demo video' };

export default function VideoPage() {
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <DisclaimerStrip short />
      <Nav />
      <div className="wrap" style={{ maxWidth: 880, paddingTop: 'var(--sp-8)', paddingBottom: 'var(--sp-11)' }}>
        <h1 style={{ fontSize: 34 }}>Watch the demo</h1>
        <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>
          Two minutes: a citizen reports a fraud by talking — then Jansah pushes the case forward, day by day.
        </p>

        <div className="card" style={{ marginTop: 'var(--sp-6)', padding: 'var(--sp-3)', background: 'var(--ink)' }}>
          <video
            controls
            playsInline
            preload="metadata"
            style={{ width: '100%', display: 'block', borderRadius: 'var(--r-2)', background: '#000' }}
          >
            <source src="/jansah-demo.mp4" type="video/mp4" />
            Your browser does not support embedded video —{' '}
            <a href="/jansah-demo.mp4" style={{ color: '#fff' }}>download it instead</a>.
          </video>
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-4)', marginTop: 'var(--sp-6)', flexWrap: 'wrap', alignItems: 'center' }}>
          <Link className="btn btn-primary" style={{ padding: '0 var(--sp-7)' }} href="/call">
            <MicIcon /> Try it live
          </Link>
          <Link className="btn" href="/track?demo=1">Explore a seeded case</Link>
          <a className="dl" href="/jansah-demo.mp4" download>Download the video</a>
        </div>

        <p className="faint" style={{ fontSize: 12, marginTop: 'var(--sp-6)' }}>
          What&apos;s real vs simulated is on the <Link href="/about">honesty page</Link>.
        </p>
      </div>
    </div>
  );
}
