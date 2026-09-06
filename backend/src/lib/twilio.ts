import { config } from '../config.js';

/**
 * Telephony REST (no SDK) — Twilio's 2010-04-01 API, which SignalWire's Compatibility API mirrors.
 * Switch providers with TELEPHONY_API_BASE (default Twilio):
 *   Twilio     : https://api.twilio.com/2010-04-01            + Account SID / API key SID / secret
 *   SignalWire : https://<space>.signalwire.com/api/laml/2010-04-01 + Project ID (as both SIDs) / API token
 */

const base = () => `${config.telephonyApiBase}/Accounts/${config.twilioAccountSid}`;
const authHeader = () =>
  `Basic ${Buffer.from(`${config.twilioApiKeySid}:${config.twilioApiKeySecret}`).toString('base64')}`;

export function twilioConfigured(): boolean {
  return !!(config.twilioAccountSid && config.twilioApiKeySid && config.twilioApiKeySecret);
}

async function tw<T>(path: string, form?: Record<string, string>, method = 'POST'): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: authHeader(), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; code?: number };
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message ?? 'error'} (code ${data.code ?? '?'})`);
  return data;
}

export interface TwilioCall { sid: string; status: string }

export async function twilioCreateCall(opts: { to: string; twimlUrl: string; statusCallback: string }): Promise<TwilioCall> {
  const min = { To: opts.to, From: config.twilioNumber, Url: opts.twimlUrl };
  // Trial accounts allow only To / Url / StatusCallback ("limited parameter access") — step down until Twilio accepts.
  const ladder: Record<string, string>[] = [
    { ...min, Method: 'POST', StatusCallback: opts.statusCallback, StatusCallbackMethod: 'POST', Timeout: '35' },
    { ...min, StatusCallback: opts.statusCallback },
    min,
  ];
  let lastErr: Error | null = null;
  for (const form of ladder) {
    try {
      return await tw<TwilioCall>('/Calls.json', form);
    } catch (err) {
      lastErr = err as Error;
      if (!/disallowed parameters|limited parameter access/i.test(lastErr.message)) throw lastErr;
      console.warn(`[twilio] call params rejected (trial) — retrying with ${Object.keys(form).length - 1} fewer`);
    }
  }
  throw lastErr ?? new Error('Twilio: call failed');
}

/** End a call from our side (best effort — trial accounts may refuse the update). */
export async function twilioHangup(callSid: string): Promise<void> {
  try { await tw(`/Calls/${callSid}.json`, { Status: 'completed' }); } catch (err) { console.warn('[twilio] hangup:', (err as Error).message); }
}

let accountTypeCache: { type: string; at: number } | null = null;
/** "Trial" | "Full" (Twilio); cached 10 min. Throws if the provider does not expose it. */
export async function twilioAccountType(): Promise<string> {
  if (accountTypeCache && Date.now() - accountTypeCache.at < 10 * 60_000) return accountTypeCache.type;
  const d = await tw<{ type?: string }>('.json', undefined, 'GET');
  const type = String(d.type ?? '');
  accountTypeCache = { type, at: Date.now() };
  return type;
}

/** Trial accounts: Twilio calls the number and asks for this validation code. */
export async function twilioVerifyCallerId(phone: string): Promise<{ validation_code: string; phone_number: string }> {
  return tw('/OutgoingCallerIds.json', { PhoneNumber: phone, FriendlyName: 'Jansah tester', CallDelay: '0' });
}

export async function twilioListNumbers(): Promise<{ phone_number: string; sid: string }[]> {
  const d = await tw<{ incoming_phone_numbers: { phone_number: string; sid: string }[] }>('/IncomingPhoneNumbers.json', undefined, 'GET');
  return d.incoming_phone_numbers ?? [];
}

export async function twilioBuyNumber(country = 'US'): Promise<string> {
  const avail = await tw<{ available_phone_numbers: { phone_number: string }[] }>(
    `/AvailablePhoneNumbers/${country}/Local.json?VoiceEnabled=true&PageSize=1`, undefined, 'GET');
  const num = avail.available_phone_numbers?.[0]?.phone_number;
  if (!num) throw new Error('No voice-capable number available');
  const bought = await tw<{ phone_number: string }>('/IncomingPhoneNumbers.json', { PhoneNumber: num, FriendlyName: 'Jansah line' });
  return bought.phone_number;
}

/** Indian mobile → E.164 (+91XXXXXXXXXX) or null. */
export function toIndianE164(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '').replace(/^0+/, '').replace(/^91(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}
