'use client';

import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-[var(--paper-1)] px-5"><div className="max-w-md text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--gerua-100)] text-[var(--gerua-800)]"><AlertCircle /></div><h1 className="mt-5 text-3xl font-semibold">Something interrupted the page.</h1><p className="mt-3 text-sm leading-6 text-[var(--ink-2)]">Your case data has not been changed. Try loading this view again.</p><Button onClick={reset} className="mt-6 h-12 rounded-xl bg-[var(--neem-700)] px-5 hover:bg-[var(--neem-600)]">Try again</Button></div></main>;
}
