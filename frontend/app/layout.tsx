import type { Metadata } from 'next';
import { Bricolage_Grotesque, Public_Sans, Noto_Sans_Devanagari, Spline_Sans_Mono } from 'next/font/google';
import './globals.css';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-bricolage' });
const publicSans = Public_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-public' });
const deva = Noto_Sans_Devanagari({ subsets: ['devanagari'], weight: ['400', '500'], variable: '--font-deva' });
const splineMono = Spline_Sans_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-spline-mono' });

export const metadata: Metadata = {
  title: 'Jansah.AI — Report a cybercrime by talking',
  description: 'Independent hackathon prototype. Voice-first cyber-complaint intake and follow-through. Not a government service.',
  robots: { index: false, follow: false },   // §12.1 noindex site-wide
  icons: [{ rel: 'icon', url: '/favicon.svg', type: 'image/svg+xml' }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${publicSans.variable} ${deva.variable} ${splineMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
