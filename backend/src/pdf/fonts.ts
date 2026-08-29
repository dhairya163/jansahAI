import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Font } from '@react-pdf/renderer';

const dir = path.dirname(fileURLToPath(import.meta.url));
const f = (name: string) => path.join(dir, 'fonts', name);

let registered = false;

/** Noto Sans + Noto Sans Devanagari embedded (P1 requirement — Hindi must never render as boxes). */
export function registerFonts(): void {
  if (registered) return;
  Font.register({
    family: 'NotoSans',
    fonts: [
      { src: f('NotoSans-400.ttf'), fontWeight: 400 },
      { src: f('NotoSans-500.ttf'), fontWeight: 500 },
      { src: f('NotoSans-700.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'NotoSansDeva',
    fonts: [
      { src: f('NotoSansDevanagari-400.ttf'), fontWeight: 400 },
      { src: f('NotoSansDevanagari-500.ttf'), fontWeight: 500 },
      { src: f('NotoSansDevanagari-700.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({ family: 'JansahMono', src: f('SplineSansMono-500.ttf') });
  // don't hyphenate identifiers
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

const DEVANAGARI_RE = /[ऀ-ॿ]/;

/** Pick the font family able to shape the given string. */
export function familyFor(text: string): 'NotoSans' | 'NotoSansDeva' {
  return DEVANAGARI_RE.test(text) ? 'NotoSansDeva' : 'NotoSans';
}
