import Link from 'next/link';
import { Mic2 } from 'lucide-react';

export function Brand({ subtitle = true }: { subtitle?: boolean }) {
  return <Link href="/" className="flex items-center gap-2.5" aria-label="Jansah.AI home"><span className="grid size-8 place-items-center rounded-[10px] bg-[var(--neem-700)] text-white"><Mic2 className="size-[17px]" /></span><span><span className="block font-heading text-lg font-semibold leading-5">Jansah<span className="text-[var(--neem-700)]">.AI</span></span>{subtitle && <span className="block text-[11px] leading-4 text-[var(--ink-3)]">Janta ka Sahai · जनता का सहाई</span>}</span></Link>;
}

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  return <nav className="h-16 border-b border-[var(--line)] bg-white"><div className="jansah-wrap flex h-full items-center justify-between"><Brand subtitle={!compact} /><div className="flex items-center gap-4 sm:gap-6"><Link href="/about" className="hidden text-sm text-[var(--ink-2)] hover:text-[var(--neem-700)] sm:block">How it works</Link><Link href="/track" className="jansah-chip jansah-chip-line no-underline">Track case</Link></div></div></nav>;
}
