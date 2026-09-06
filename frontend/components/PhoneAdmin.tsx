'use client';
import { useEffect, useState } from 'react';
import { opsPhoneNumbers, opsVerifyCaller, opsBuyNumber } from '@/lib/api';

/** Ops: phone-line setup on the Twilio trial (verify caller → buy number). */
export function PhoneAdmin({ auth }: { auth: string }) {
  const [info, setInfo] = useState<{ configured: boolean; numbers: { phone_number: string }[]; active: string | null } | null>(null);
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => opsPhoneNumbers(auth).then(setInfo).catch(() => setInfo({ configured: false, numbers: [], active: null }));
  useEffect(() => { void load(); }, [auth]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return null;
  return (
    <details className="card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-6)' }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500 }} className="muted">
        📞 Phone line · {info.configured ? (info.active ? `active ${info.active}` : `${info.numbers.length} number(s), none active in env`) : 'not configured'}
      </summary>
      <div style={{ marginTop: 'var(--sp-3)', display: 'grid', gap: 'var(--sp-3)', fontSize: 13 }}>
        <p className="faint">Trial accounts must verify a caller before a number can be bought, and can only call verified numbers.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ maxWidth: 220, minHeight: 38 }} placeholder="+91 mobile to verify" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn btn-sm" disabled={busy} onClick={async () => {
            setBusy(true); setMsg('');
            try { const r = await opsVerifyCaller(auth, phone); setMsg(`Twilio is calling ${r.phone} — enter code ${r.validation_code} on the keypad.`); }
            catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
          }}>Verify caller</button>
          <button className="btn btn-sm" disabled={busy} onClick={async () => {
            setBusy(true); setMsg('');
            try { const r = await opsBuyNumber(auth); setMsg(`Number ${r.number} added — set TWILIO_NUMBER=${r.number} in the backend env and restart.`); await load(); }
            catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
          }}>Get trial number</button>
        </div>
        {info.numbers.length > 0 && <p className="mono" style={{ fontSize: 12.5 }}>{info.numbers.map((n) => n.phone_number).join(' · ')}</p>}
        {msg && <p style={{ color: 'var(--neem-900)' }}>{msg}</p>}
      </div>
    </details>
  );
}
