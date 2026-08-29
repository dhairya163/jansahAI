import Link from 'next/link';

/** Shared chrome per the Jansah UI kit: disclaimer strip (never dismissible), logo, nav, ribbon. */

export function DisclaimerStrip({ short = false }: { short?: boolean }) {
  return (
    <div className="disclaimer">
      {short
        ? 'Independent prototype · demo data only'
        : 'Independent hackathon prototype. Not a government service. Use fictional details only.'}
    </div>
  );
}

export function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg className="ic" style={{ width: size, height: size }} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

/**
 * The Jansah shirorekha mark (jansah-logo kit): headline stroke + hanging voice
 * waveform + letterform stem + amber bindu. Bar lengths are fixed — never redraw.
 * `tile` = app-icon.svg (white on neem rounded square, haldi-200 bindu);
 * otherwise mark.svg (neem on light, haldi bindu).
 */
export function JansahMark({ size = 32, tile = true }: { size?: number; tile?: boolean }) {
  if (tile) {
    return (
      <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden style={{ flex: 'none', borderRadius: size * 0.3125 }}>
        <rect width="96" height="96" rx="24" fill="#0A5C4A" />
        <g stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" fill="none">
          <line x1="22" y1="30" x2="74" y2="30" />
          <line x1="32" y1="30" x2="32" y2="50" />
          <line x1="46" y1="30" x2="46" y2="68" />
          <line x1="60" y1="30" x2="60" y2="56" />
          <line x1="74" y1="30" x2="74" y2="75" />
        </g>
        <circle cx="82" cy="21" r="4.8" fill="#F3D9A0" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ flex: 'none' }}>
      <g stroke="#0A5C4A" strokeWidth="4" strokeLinecap="round" fill="none">
        <line x1="9" y1="12" x2="39" y2="12" />
        <line x1="15" y1="12" x2="15" y2="24" />
        <line x1="23" y1="12" x2="23" y2="34" />
        <line x1="31" y1="12" x2="31" y2="27" />
        <line x1="39" y1="12" x2="39" y2="38" />
      </g>
      <circle cx="44" cy="7" r="2.8" fill="#B8770F" />
    </svg>
  );
}

/** loading-loop.svg — the kit's callback-loop motif; SPINNER USE ONLY per the logo sheet. */
export function LoadingLoop({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="Loading" role="img" style={{ flex: 'none' }}>
      <g className="loop-arc" style={{ transformOrigin: '24px 24px' }}>
        <path d="M40 24a16 16 0 1 1-5-11.6" fill="none" stroke="#0A5C4A" strokeWidth="4" strokeLinecap="round" />
        <path d="M35 5v8h-8" fill="none" stroke="#0A5C4A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g stroke="#B8770F" strokeWidth="3.4" strokeLinecap="round">
        <line x1="18" y1="20" x2="18" y2="28" />
        <line x1="24" y1="17" x2="24" y2="31" />
        <line x1="30" y1="21" x2="30" y2="27" />
      </g>
    </svg>
  );
}

export function Logo() {
  return <JansahMark size={32} />;
}

export function BrandRow({ tagline = true }: { tagline?: boolean }) {
  return (
    <div className="brandrow">
      <Logo />
      <div>
        <div className="wordmark">Jansah<span>.AI</span></div>
        {tagline && <div className="faint" style={{ fontSize: 11, marginTop: -3 }}>Janta ka Sahai · जनता का सहाई</div>}
      </div>
    </div>
  );
}

export function Nav({ right }: { right?: React.ReactNode }) {
  return (
    <div className="nav">
      <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <Link href="/" style={{ textDecoration: 'none' }}><BrandRow /></Link>
        {right ?? (
          <div className="navlinks">
            <Link href="/about">How it works</Link>
            <Link href="/video">Video</Link>
            <Link href="/track">Track case</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export function LangRibbon({ pill = false }: { pill?: boolean }) {
  return (
    <p className="ribbon" style={pill ? { display: 'inline-block', borderRadius: 999, padding: '6px 16px' } : undefined}>
      बोलिए · Speak · ಮಾತನಾಡಿ · பேசுங்கள் · বলুন · మాట్లాడండి · ਬੋਲੋ · बोला
    </p>
  );
}

export function FooterNote() {
  return (
    <p className="faint" style={{ fontSize: 12, marginTop: 'var(--sp-6)' }}>
      Jansah.AI · an independent builder prototype · not affiliated with any government body
    </p>
  );
}
