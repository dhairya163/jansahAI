import { DisclaimerStrip } from '@/components/disclaimer-strip';
import { SiteHeader } from '@/components/site-header';

import { CallClient } from './call-client';

export default function CallPage() {
  return <main className="min-h-screen bg-[var(--paper-1)]"><DisclaimerStrip short /><SiteHeader compact /><CallClient /></main>;
}
