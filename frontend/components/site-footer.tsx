import Link from 'next/link';

export function SiteFooter() {
  return <footer className="border-t border-[var(--line)] bg-[var(--paper-1)]"><div className="jansah-wrap flex flex-col gap-3 py-6 text-[11.5px] text-[var(--ink-3)] sm:flex-row sm:items-center sm:justify-between"><p>Jansah.AI · an independent builder prototype · not affiliated with any government body</p><div className="flex gap-5"><Link href="/about" className="hover:text-[var(--neem-700)]">About & honesty</Link><Link href="/ops" className="hover:text-[var(--neem-700)]">Officials console</Link></div></div></footer>;
}
