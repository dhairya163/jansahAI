import { DisclaimerStrip } from '@/components/disclaimer-strip';
import { SiteHeader } from '@/components/site-header';

import { TrackClient } from './track-client';

export default function TrackPage() {
  return <main className="min-h-screen bg-[var(--paper-1)]"><DisclaimerStrip short /><SiteHeader compact /><TrackClient /></main>;
}
