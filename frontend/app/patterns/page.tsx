'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DisclaimerStrip, Nav, MicIcon, LoadingLoop } from '@/components/chrome';
import { fetchPatterns, type PatternDto, type RadarStats } from '@/lib/api';

/** Scam radar — anonymised, aggregated patterns from everyone's reports. Counts only; no reporter is ever shown. */

function Sparkline({ values, color, width = 96, height = 34 }: { values: number[]; color: string; width?: number; height?: number }) {
  const w = width, h = height, max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${2 + (i * (w - 4)) / Math.max(1, values.length - 1)},${h - 4 - (v / max) * (h - 8)}`);
  const last = pts[pts.length - 1]?.split(',') ?? ['0', '0'];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="7-day trend">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  );
}

const GROUPS: { key: string; label: string; test: (p: PatternDto) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'financial', label: 'Money', test: (p) => (p.category ?? '').startsWith('financial') || p.modus === 'digital_arrest' },
  { key: 'impersonation', label: 'Impersonation', test: (p) => ['impersonation_profile', 'account_takeover', 'fake_customer_care'].includes(p.modus) },
  { key: 'wc', label: 'Women & children', test: (p) => (p.category ?? '').startsWith('wc_') },
];

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3.6e6);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export default function PatternsPage() {
  const [data, setData] = useState<{ stats: RadarStats; patterns: PatternDto[] } | null>(null);
  const [err, setErr] = useState('');
  const [group, setGroup] = useState('all');
  const [region, setRegion] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'hi'>('en');

  useEffect(() => {
    fetchPatterns().then(setData).catch((e) => setErr((e as Error).message));
    const iv = setInterval(() => { fetchPatterns().then(setData).catch(() => undefined); }, 30_000);
    return () => clearInterval(iv);
  }, []);

  const regions = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of data?.patterns ?? []) for (const r of p.regions) m[r.region] = (m[r.region] ?? 0) + r.count;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r]) => r);
  }, [data]);

  const shown = (data?.patterns ?? [])
    .filter((p) => GROUPS.find((g) => g.key === group)?.test(p))
    .filter((p) => !region || p.regions.some((r) => r.region === region));

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <DisclaimerStrip short />
      <Nav />
      <div className="wrap" style={{ maxWidth: 920, paddingTop: 'var(--sp-8)', paddingBottom: 'var(--sp-11)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 34 }}>{lang === 'hi' ? 'स्कैम रडार' : 'Scam radar'}</h1>
            <p className="muted" style={{ marginTop: 'var(--sp-2)', maxWidth: '58ch' }}>
              {lang === 'hi'
                ? 'लोग अभी क्या रिपोर्ट कर रहे हैं — ताकि आप इसे पहचान लें, इससे पहले कि यह आपके साथ हो। सिर्फ़ गिनती; किसी शिकायतकर्ता का नाम कभी नहीं।'
                : 'What people are reporting right now — so you recognise it before it happens to you. Counts only; no reporter is ever named.'}
            </p>
          </div>
          <button className="chip chip-line" onClick={() => setLang((l) => (l === 'en' ? 'hi' : 'en'))}>{lang === 'en' ? 'हिं' : 'EN'}</button>
        </div>

        {!data && !err && <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-10)' }}><LoadingLoop size={40} /></div>}
        {err && <p style={{ color: 'var(--gerua-800)', marginTop: 'var(--sp-6)' }}>{err}</p>}

        {data && (
          <>
            <div className="radar-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--sp-4)', marginTop: 'var(--sp-6)', padding: 'var(--sp-5)', border: '1px solid var(--line)', borderRadius: 'var(--r-3)', background: 'var(--paper-1)' }}>
              <div><p className="disp" style={{ fontSize: 30, lineHeight: 1 }}>{data.stats.reports_30d}</p><p className="faint" style={{ fontSize: 12, marginTop: 4 }}>{lang === 'hi' ? 'रिपोर्ट · 30 दिन' : 'reports · 30 days'}</p></div>
              <div><p className="disp" style={{ fontSize: 30, lineHeight: 1 }}>{data.stats.active_patterns}</p><p className="faint" style={{ fontSize: 12, marginTop: 4 }}>{lang === 'hi' ? 'सक्रिय पैटर्न' : 'active patterns'}</p></div>
              <div><p className="disp" style={{ fontSize: 24, lineHeight: 1.2 }}>{data.stats.top_region ?? '—'}</p><p className="faint" style={{ fontSize: 12, marginTop: 4 }}>{lang === 'hi' ? 'सबसे ज़्यादा रिपोर्ट वाला शहर' : 'most reported city'}</p></div>
              <div>
                <p className="disp" style={{ fontSize: 24, lineHeight: 1.2, color: 'var(--gerua-600)' }}>
                  {data.stats.fastest?.change_pct !== null && data.stats.fastest?.change_pct !== undefined ? `↑ ${data.stats.fastest.change_pct}%` : '—'}
                </p>
                <p className="faint" style={{ fontSize: 12, marginTop: 4 }}>{lang === 'hi' ? 'सबसे तेज़ बढ़ता' : 'fastest rising'}: {data.stats.fastest?.title.slice(0, 40)}</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'var(--sp-5)', flexWrap: 'wrap', alignItems: 'center' }}>
              {GROUPS.map((g) => (
                <button key={g.key} className={`chip ${group === g.key ? 'chip-neem' : 'chip-line'}`} onClick={() => setGroup(g.key)}>{g.label}</button>
              ))}
              <span style={{ width: 1, height: 18, background: 'var(--line-2)', margin: '0 4px' }} />
              {regions.map((r) => (
                <button key={r} className={`chip ${region === r ? 'chip-sim' : 'chip-line'}`} onClick={() => setRegion(region === r ? null : r)}>{r}</button>
              ))}
            </div>

            <div className="stack-3" style={{ marginTop: 'var(--sp-5)' }}>
              {shown.map((p) => (
                <article key={p.id} className="card" style={{ padding: 'var(--sp-5)', borderColor: p.count_7d >= 3 ? 'var(--gerua-200)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-4)', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="chip chip-sim">{p.category_label ? (lang === 'hi' ? p.category_label.hi : p.category_label.en) : p.modus.replace(/_/g, ' ')}</span>
                      <h2 style={{ fontSize: 19, marginTop: 'var(--sp-3)' }}>{lang === 'hi' && p.title_hi ? p.title_hi : p.title}</h2>
                      <p className="muted" style={{ fontSize: 14, marginTop: 6, maxWidth: '62ch' }}>{lang === 'hi' && p.brief_hi ? p.brief_hi : p.brief}</p>
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <Sparkline values={p.trend.length ? p.trend : [0, 0, 0, 0, 0, 0, 0]} color={p.count_7d >= 3 ? '#C2491F' : '#B8770F'} />
                      <p className="faint" style={{ fontSize: 11 }}>{lang === 'hi' ? '7 दिन' : 'last 7 days'}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'var(--sp-4)', alignItems: 'center' }}>
                    <span className="chip chip-line"><b>{p.count_30d}</b>&nbsp;{lang === 'hi' ? 'रिपोर्ट · 30 दिन' : 'reports · 30d'}</span>
                    {p.regions.slice(0, 3).map((r) => <span key={r.region} className="chip chip-line">{r.region} · {r.count}</span>)}
                    {p.identifiers.map((i) => <span key={i.masked} className="chip chip-line mono" style={{ fontSize: 11 }}>{i.masked}</span>)}
                    <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>{lang === 'hi' ? 'आख़िरी रिपोर्ट' : 'last report'} {timeAgo(p.last_seen)}</span>
                  </div>
                  {p.guidance.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'var(--sp-3)' }}>
                      {p.guidance.map((g) => <span key={g.key} className="chip chip-neem" title={g.body}>{g.title} →</span>)}
                    </div>
                  )}
                </article>
              ))}
              {shown.length === 0 && <p className="faint" style={{ padding: 'var(--sp-6) 0' }}>No patterns match that filter yet.</p>}
            </div>

            <div className="callout-neem" style={{ marginTop: 'var(--sp-8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontWeight: 500, color: 'var(--neem-900)' }}>{lang === 'hi' ? 'आपके साथ भी ऐसा हुआ?' : 'Did one of these happen to you?'}</p>
                <p style={{ fontSize: 13.5, color: 'var(--neem-700)', marginTop: 2 }}>{lang === 'hi' ? 'बोलकर रिपोर्ट करें — आपका केस इस रडार को और बेहतर बनाता है।' : 'Report by voice — your case sharpens the radar for everyone.'}</p>
              </div>
              <Link className="btn btn-primary" style={{ minHeight: 48 }} href="/call"><MicIcon /> {lang === 'hi' ? 'अभी रिपोर्ट करें' : 'Report now'}</Link>
            </div>
            <p className="faint" style={{ fontSize: 12, marginTop: 'var(--sp-5)' }}>
              {lang === 'hi'
                ? 'हर कार्ड AI द्वारा गुमनाम रिपोर्ट से लिखा गया है। गिनती डेमो शिकायतों से है; किसी शिकायतकर्ता का नाम, नंबर या राशि कभी नहीं दिखाई जाती।'
                : 'Each card is written by AI from anonymised reports. Counts come from demo complaints; no reporter’s name, number or amount is ever shown.'}
            </p>
          </>
        )}
      </div>
      <style>{`@media (min-width: 720px) { .radar-stats { grid-template-columns: repeat(4, 1fr) !important; } }`}</style>
    </div>
  );
}
