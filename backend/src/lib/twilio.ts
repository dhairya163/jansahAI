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
  const full = {
    To: opts.to, From: config.twilioNumber, Url: opts.twimlUrl, Method: 'POST',
    StatusCallback: opts.statusCallback, StatusCallbackMethod: 'POST', Timeout: '35',
  };
  try {
    return await tw<TwilioCall>('/Calls.json', full);
  } catch (err) {
    // Trial accounts reject some optional parameters ("limited parameter access") — fall back to the bare minimum.
    if (/disallowed parameters|limited parameter access/i.test((err as Error).message)) {
      console.warn('[twilio] optional call params rejected (trial) — retrying with To/From/Url only');
      return tw<TwilioCall>('/Calls.json', { To: opts.to, From: config.twilioNumber, Url: opts.twimlUrl });
    }
    throw err;
  }
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
