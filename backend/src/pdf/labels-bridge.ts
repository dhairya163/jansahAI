/** Small bridge so pdf/ modules don't import the whole engine (keeps legal text sources obvious). */
import { CATEGORY_LABELS, TRACK_LABELS, SECTIONS_LINE, type Bi } from '../engine/labels.js';

export type { Bi };

export function categoryLabel(category: string): Bi {
  return CATEGORY_LABELS[category] ?? { en: category, hi: category };
}

export function trackOf(track: string): Bi {
  return TRACK_LABELS[track] ?? { en: track, hi: track };
}

export function sectionsLine(category: string): string {
  return SECTIONS_LINE[category] ?? 'as applicable on the stated facts';
}
