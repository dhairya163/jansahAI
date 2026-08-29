import type { Metadata } from 'next';
import { Bricolage_Grotesque, Noto_Sans_Devanagari, Public_Sans, Spline_Sans_Mono } from 'next/font/google';
import './globals.css';

const display = Bricolage_Grotesque({ variable: '--font-bricolage', subsets: ['latin'], weight: ['500', '600'] });
const body = Public_Sans({ variable: '--font-public', subsets: ['latin'], weight: ['400', '500', '600'] });
const devanagari = Noto_Sans_Devanagari({ variable: '--font-devanagari', subsets: ['devanagari'], weight: ['400', '500'] });
const mono = Spline_Sans_Mono({ variable: '--font-spline', subsets: ['latin'], weight: ['500'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Jansah.AI — Report a cybercrime by talking',
  description: 'Voice-first cybercrime reporting, citizen documents, and time-bound follow-through.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Jansah.AI — Janta ka Sahai',
    description: 'Report a cybercrime by talking. Get the right documents and keep the case moving.',
    images: [{ url: '/og-jansah.png', width: 1731, height: 909, alt: 'Jansah.AI — Janta ka Sahai' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jansah.AI — Janta ka Sahai',
    description: 'Report a cybercrime by talking. Get the right documents and keep the case moving.',
    images: ['/og-jansah.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${display.variable} ${body.variable} ${devanagari.variable} ${mono.variable}`}>{children}</body></html>;
}
