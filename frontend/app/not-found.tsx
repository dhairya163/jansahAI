import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-[var(--paper-1)] px-5"><div className="max-w-md text-center"><p className="text-xs font-medium text-[var(--gerua-600)]">404</p><h1 className="mt-3 text-4xl font-semibold">That page isn’t here.</h1><p className="mt-3 text-[var(--ink-2)]">Return home or use the case tracker.</p><div className="mt-6 flex justify-center gap-3"><Link href="/" className={cn(buttonVariants(), 'h-11 rounded-xl bg-[var(--neem-700)]')}>Home</Link><Link href="/track" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 rounded-xl bg-white')}>Track a case</Link></div></div></main>;
}
