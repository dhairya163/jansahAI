import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { DisclaimerStrip } from '@/components/disclaimer-strip';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

const notes = [
  ['The model can’t cheat', 'The AI cannot change case status, confirm freezes, or mark FIRs — only the officials console can. Escalation letters are downloads only; the system never emails a real authority, bank, or platform.'],
  ['Your data', 'Use fictional details. Transcripts are redacted — any 12-digit number is masked to its last four — and demo data is purged after 7 days.'],
  ['Phone-ready by design', 'The voice stack supports SIP natively; a real dialable number is a telco KYC away. We demo over the web to stay inside hackathon rules.'],
];

export default function AboutPage() {
  return <main className="min-h-screen bg-[var(--paper-1)]">
    <DisclaimerStrip />
    <SiteHeader compact />
    <section className="jansah-wrap max-w-[880px]! py-10 sm:py-16 lg:pb-24">
      <h1 className="text-2xl font-semibold sm:text-[34px]">What&apos;s real, what&apos;s simulated</h1>
      <p className="mt-2 text-[13.5px] text-[var(--ink-2)] sm:text-[15px]">The honesty page — everything a reviewer should know before judging.</p>

      <div className="mt-5 grid gap-3 sm:mt-8 sm:grid-cols-2 sm:gap-6">
        <article className="jansah-card p-5"><h2 className="font-sans text-[15px] font-medium text-[var(--neem-900)]">Real</h2><p className="mt-1.5 text-[13.5px] leading-6 text-[var(--ink-2)]">OpenAI voice + text models · the case engine and every clock · all nine PDF letter templates · emails to the complainant · Postgres · this website.</p></article>
        <article className="jansah-card border-[var(--gerua-200)] p-5"><h2 className="font-sans text-[15px] font-medium text-[var(--gerua-800)]">Simulated</h2><p className="mt-1.5 text-[13.5px] leading-6 text-[var(--ink-2)]">Aadhaar OTP and SMS · NCRP registration · CFCFRMS freeze chain · bank responses · police/FIR marking · suspect repository · restoration module.</p></article>
      </div>

      <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4">
        {notes.map(([title, body]) => <article key={title} className="jansah-card p-5"><h2 className="font-sans text-[15px] font-medium">{title}</h2><p className="mt-1.5 text-[13.5px] leading-6 text-[var(--ink-2)]">{body}</p></article>)}
      </div>

      <div className="jansah-card mt-4 p-5 sm:mt-6"><h2 className="font-sans text-[15px] font-medium">Backend is the trust boundary</h2><p className="mt-1.5 text-[13.5px] leading-6 text-[var(--ink-2)]">The browser talks only to the separate Node.js API. Validation, redaction, OTP, clocks, documents, email, database access, and every external API call stay server-side.</p><Link href="/ops" className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--neem-700)]">Open officials console <ArrowRight className="size-3.5" /></Link></div>
    </section>
    <SiteFooter />
  </main>;
}
