const INDIA_OFFSET = '+05:30';

const numberWords: Record<string, number> = {
  zero: 0, shunya: 0, 'शून्य': 0,
  one: 1, ek: 1, 'एक': 1,
  two: 2, do: 2, 'दो': 2,
  three: 3, teen: 3, 'तीन': 3,
  four: 4, char: 4, chaar: 4, 'चार': 4,
  five: 5, panch: 5, paanch: 5, 'पांच': 5, 'पाँच': 5,
  six: 6, chhe: 6, cheh: 6, 'छह': 6,
  seven: 7, saat: 7, 'सात': 7,
  eight: 8, aath: 8, 'आठ': 8,
  nine: 9, nau: 9, 'नौ': 9,
  ten: 10, das: 10, 'दस': 10,
  eleven: 11, gyarah: 11, 'ग्यारह': 11,
  twelve: 12, barah: 12, 'बारह': 12,
};

const devanagariDigits = '०१२३४५६७८९';

function normalizeDigits(value: string) {
  return value.replace(/[०-९]/g, (digit) => String(devanagariDigits.indexOf(digit)));
}

function indiaCalendarParts(reference: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(reference);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function shiftedDate(reference: Date, offsetDays: number) {
  const local = indiaCalendarParts(reference);
  const shifted = new Date(Date.UTC(local.year, local.month - 1, local.day + offsetDays));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

function spokenHour(text: string) {
  const numeric = text.match(/(?:^|\s)(\d{1,2})(?:[:.](\d{1,2}))?\s*(?:बजे|baje|am|pm)(?:\s|$)/i);
  if (numeric) return { hour: Number(numeric[1]), minute: Number(numeric[2] ?? 0) };

  const tokens = text.split(/[^a-z\u0900-\u097f]+/i).filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    const hour = numberWords[tokens[index]];
    if (hour === undefined) continue;
    if (tokens.slice(index + 1, index + 4).some((token) => token === 'बजे' || token.toLowerCase() === 'baje')) {
      return { hour, minute: 0 };
    }
  }

  const nearPeriod = text.match(/(?:रात|raat|night|शाम|shaam|evening|सुबह|subah|morning|दोपहर|dopahar|afternoon)[^\d]{0,12}(\d{1,2})(?:[:.](\d{1,2}))?/i)
    ?? text.match(/(\d{1,2})(?:[:.](\d{1,2}))?[^\d]{0,12}(?:रात|raat|night|शाम|shaam|evening|सुबह|subah|morning|दोपहर|dopahar|afternoon)/i);
  return nearPeriod ? { hour: Number(nearPeriod[1]), minute: Number(nearPeriod[2] ?? 0) } : undefined;
}

function adjustPeriod(hour: number, text: string) {
  if (/\bpm\b/i.test(text)) return hour < 12 ? hour + 12 : hour;
  if (/\bam\b/i.test(text)) return hour === 12 ? 0 : hour;
  if (/(रात|raat|night)/i.test(text)) return hour === 12 ? 0 : hour < 12 ? hour + 12 : hour;
  if (/(शाम|shaam|evening|दोपहर|dopahar|afternoon)/i.test(text)) return hour < 12 ? hour + 12 : hour;
  if (/(सुबह|subah|morning)/i.test(text)) return hour === 12 ? 0 : hour;
  return hour;
}

export function normalizeIncidentTimestamp(value: unknown, reference: string | Date = new Date()) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const source = normalizeDigits(value.trim());

  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(source)) {
    const explicit = Date.parse(source);
    return Number.isFinite(explicit) ? new Date(explicit).toISOString() : undefined;
  }

  const base = reference instanceof Date ? reference : new Date(reference);
  if (!Number.isFinite(base.getTime())) return undefined;
  const text = source.toLowerCase().replace(/[,!?]/g, ' ');
  const time = spokenHour(text);
  if (!time) {
    const parsed = Date.parse(source);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
  }

  const hour = adjustPeriod(time.hour, text);
  if (hour < 0 || hour > 23 || time.minute < 0 || time.minute > 59) return undefined;
  const offsetDays = /(परसों|parso|day before yesterday)/i.test(text) ? -2
    : /(कल|\bkal\b|yesterday|last night)/i.test(text) ? -1
      : 0;
  const date = shiftedDate(base, offsetDays);
  const isoWithOffset = `${date.year}-${pad(date.month)}-${pad(date.day)}T${pad(hour)}:${pad(time.minute)}:00${INDIA_OFFSET}`;
  const parsed = Date.parse(isoWithOffset);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}
