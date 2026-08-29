import { repository } from './db/repository.js';
import { id } from './lib/ids.js';
import { registerCase } from './services/cases.js';

export async function ensureSeedData() {
  if ((await repository.listCases()).length) return;
  for (let index = 0; index < 3; index += 1) await repository.addSuspect({ id: id(), kind: 'upi', valueNorm: 'quickhelp.desk@okpay' });
  await repository.addSuspect({ id: id(), kind: 'upi', valueNorm: 'refund.support@paytmz' });
  await repository.addSuspect({ id: id(), kind: 'url', valueNorm: 'kyc-update-sbi.in' });
  await repository.addSuspect({ id: id(), kind: 'email', valueNorm: 'claims@parcel-verify.org' });

  await registerCase({ category: 'financial_upi', language: 'hi-en', reporterName: 'Ravi Kumar', phone: '+919876543841', aadhaar: '111122223333', amount: 48000, incidentAt: new Date(Date.now() - 20 * 60_000).toISOString(), narrative: 'A caller claimed my parcel contained drugs and demanded a verification fee. I sent two UPI transfers before realising it was fraud.', slots: { instrument: 'upi', own_bank: 'HDFC Bank', payee_identifier: 'quickhelp.desk@okpay', txns: [{ amount: 30000, ref: 'TXN30000A', method: 'UPI' }, { amount: 18000, ref: 'TXN18000B', method: 'UPI' }], suspect_contacts: [{ kind: 'upi', value: 'quickhelp.desk@okpay' }] }, demoPersona: 'ravi' });
  await registerCase({ category: 'digital_arrest_no_loss', language: 'hi', reporterName: 'Sunita Sharma', phone: '+919812340921', aadhaar: '111122224444', narrative: 'A caller claiming to be a CBI officer kept me on a video call and demanded a verification transfer. I hung up before sending money.', slots: { caller_claims: 'CBI officer and digital custody', numbers: ['+919812000001'] }, demoPersona: 'sunita' });
  await registerCase({ category: 'wc_ncii', language: 'en', anonymous: true, narrative: 'An ex-partner posted intimate images on two social platforms without consent and threatened to share them further.', slots: { platforms: ['Instagram', 'X'], urls: ['https://example.test/post/fictional'], suspect_handles: ['@demo_handle'], first_seen_at: new Date().toISOString() }, demoPersona: 'anonymous-ncii' });
}
