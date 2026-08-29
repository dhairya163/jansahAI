const devanagariToLatin = (value: string) =>
  value.replace(/[०-९]/g, (digit) => String('०१२३४५६७८९'.indexOf(digit)));

export function redactSensitive(input: unknown, context = ''): unknown {
  if (typeof input === 'string') {
    let value = devanagariToLatin(input);
    value = value.replace(/\b(?:\d[\s-]?){12}\b/g, (match) => {
      const digits = match.replace(/\D/g, '');
      return `########${digits.slice(-4)}`;
    });
    value = value.replace(/\b(?:\d[\s-]?){13,19}\b/g, 'CARD-REDACTED');
    if (/otp|one.?time|verification code/i.test(context)) {
      value = value.replace(/\b\d{6}\b/g, 'OTP-REDACTED');
    }
    return value;
  }
  if (Array.isArray(input)) return input.map((item) => redactSensitive(item, context));
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, redactSensitive(value, `${context}.${key}`)]),
    );
  }
  return input;
}

export const normalizeSuspect = (value: string) => value.trim().toLowerCase();

export function maskPhone(phone?: string) {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)}` : '+91';
  return `${country}••••••${digits.slice(-4)}`;
}

export function aadhaarLast4(value?: string) {
  if (!value) return undefined;
  return value.replace(/\D/g, '').slice(-4) || undefined;
}
