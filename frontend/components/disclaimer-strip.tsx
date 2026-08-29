import { TriangleAlert } from 'lucide-react';

export function DisclaimerStrip({ short = false }: { short?: boolean }) {
  return <div className="flex min-h-8 items-start justify-center gap-2 bg-[var(--haldi-100)] px-5 py-2 text-center text-xs leading-[1.5] text-[var(--haldi-800)]"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /><span>{short ? 'Independent prototype · demo data only' : 'Independent hackathon prototype. Not a government service. Use fictional details only.'}</span></div>;
}
