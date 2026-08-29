import Link from 'next/link';
import { Check, FlaskConical, Mic2, Search } from 'lucide-react';

import { DisclaimerStrip } from '@/components/disclaimer-strip';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

const steps = [
  ['1', 'Talk', 'The complaint fills itself as you speak — every number read back digit by digit.'],
  ['2', 'Get your documents', 'Case number, complaint PDF, and the right action letter for your category — instantly.'],
  ['3', 'We chase it', 'Clocks run. Day-15 FIR pack, SP letter, magistrate draft — emailed, ready to sign.'],
];

export default function Home() {
  return <main className="min-h-screen bg-white text-[var(--ink)]">
    <DisclaimerStrip />
    <SiteHeader />

    <section className="jansah-wrap grid gap-10 py-8 sm:py-16 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:gap-16 lg:py-24">
      <div>
        <h1 className="text-[30px] font-semibold sm:text-[52px]">Report a cybercrime<br />by talking.</h1>
        <p className="mt-3 max-w-[44ch] text-[14.5px] leading-6 text-[var(--ink-2)] sm:mt-4 sm:text-lg sm:leading-8">In your language. Then Jansah pushes it forward — the bank notice on day 0, the FIR pack on day 15, escalation letters on time.</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/call" className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl border border-[var(--neem-700)] bg-[var(--neem-700)] px-8 text-base font-medium text-white hover:bg-[var(--neem-600)]"><Mic2 className="size-4" />Report by voice</Link>
          <Link href="/track" className="inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl border border-[var(--line-2)] bg-white px-6 text-base font-medium hover:bg-[var(--paper-1)]"><Search className="size-4 sm:hidden" />Track my case</Link>
        </div>
        <p className="jansah-ribbon mt-5 rounded-full px-4 py-1.5 text-[12.5px] sm:mt-6 sm:inline-block">बोलिए · Speak · ಮಾತನಾಡಿ · பேசுங்கள் · বলুন · మాట్లాడండి · ਬੋਲੋ · बोला</p>
      </div>

      <div className="jansah-card hidden bg-[var(--paper-1)] p-6 lg:block">
        <p className="text-xs text-[var(--ink-3)]">Why this exists</p>
        <p className="mt-2 font-heading text-[26px] font-semibold leading-[1.15]">3.24 crore calls to 1930 last year.<br /><span className="text-[var(--gerua-600)]">~1.4%</span> became FIRs.</p>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-2)]">Intake exists. Follow-through didn&apos;t. Jansah calls you back on day 15 — with the documents attached.</p>
      </div>
    </section>

    <section className="border-y border-[var(--line)] bg-[var(--paper-1)]">
      <div className="jansah-wrap py-10 sm:py-16">
        <p className="mb-3 text-[13px] font-medium text-[var(--ink-2)] sm:hidden">How it works</p>
        <div className="grid gap-3 md:grid-cols-3 md:gap-6">
          {steps.map(([number, title, body]) => <article key={number} className="jansah-card flex gap-3 p-4 md:block md:p-5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--neem-100)] text-xs font-medium text-[var(--neem-900)] md:inline-flex md:size-auto md:rounded-full md:px-3 md:py-1">{number}</span>
            <div><h2 className="font-sans text-[13.5px] font-medium md:mt-3 md:text-[15px]">{title}</h2><p className="mt-1 text-[13px] leading-5 text-[var(--ink-2)] md:text-[13.5px]">{body}</p></div>
          </article>)}
        </div>
      </div>
    </section>

    <section className="jansah-wrap py-10 sm:py-16 lg:pb-24">
      <div className="grid gap-3 md:grid-cols-2 md:gap-6">
        <div className="jansah-card p-4 md:p-5"><p className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--neem-900)]"><Check className="size-4 text-[var(--neem-700)]" />Real</p><p className="mt-1 text-[13.5px] text-[var(--ink-2)]">Voice AI, case engine, clocks, PDFs, emails.</p></div>
        <div className="jansah-card border-[var(--gerua-200)] p-4 md:p-5"><p className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--gerua-800)]"><FlaskConical className="size-4 text-[var(--gerua-600)]" />Simulated</p><p className="mt-1 text-[13.5px] text-[var(--ink-2)]">Aadhaar OTP, freeze chain, bank, police, SMS.</p></div>
      </div>
    </section>
    <SiteFooter />
  </main>;
}
