/** §20 — virtual now for a case = now() + time_offset_days. */

export function virtualNow(timeOffsetDays: number, base: Date = new Date()): Date {
  return new Date(base.getTime() + timeOffsetDays * 86_400_000);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function fmtDateIST(d: Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', ...opts,
  }).format(d);
}

export function fmtDateTimeIST(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
}
