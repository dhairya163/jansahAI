import { DisclaimerStrip } from '@/components/disclaimer-strip';
import { SiteHeader } from '@/components/site-header';

import { OpsClient } from './ops-client';

export default function OpsPage() {
  return <main className="min-h-screen bg-[var(--paper-1)]"><DisclaimerStrip short /><SiteHeader compact /><OpsClient /></main>;
}
