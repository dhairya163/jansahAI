type Guidance = { title: string; body: string; titleHi?: string; bodyHi?: string };

export const guidance: Record<string, Guidance> = {
  golden_hour: {
    title: 'Move quickly',
    body: 'Money moved by fraud usually sits briefly in a mule account before being layered onward. Reporting within the first hour gives the best chance of a hold; even now, faster is better.',
    titleHi: 'जल्दी कार्रवाई करें',
    bodyHi: 'धोखे से गया पैसा कुछ समय दूसरे खाते में रुकता है। पहले घंटे में रिपोर्ट करने से पैसा रोकने की संभावना सबसे ज़्यादा होती है — अभी भी जितना जल्दी, उतना अच्छा।',
  },
  bank_3day_rule: {
    title: 'Write to your bank within 3 working days',
    body: "Send the written dispute to your own bank within 3 working days of learning of the fraud. Reported in time, RBI's framework can make your liability zero for unauthorised transactions. Sign the letter in your case file and demand a written acknowledgment.",
    titleHi: '3 कार्य-दिवसों में बैंक को लिखें',
    bodyHi: 'धोखाधड़ी का पता चलने के 3 कार्य-दिवसों के भीतर अपने बैंक को लिखित शिकायत दें। पत्र आपकी केस फ़ाइल में तैयार है — हस्ताक्षर कर बैंक में जमा करें और लिखित पावती माँगें।',
  },
  ezero_fir: { title: 'e-Zero FIR threshold', body: 'Losses of ₹10 lakh or more reported through the national system may qualify for automatic Zero FIR handling. This prototype only explains the pathway and never contacts police.' },
  freeze_meaning: { title: 'A hold is not yet a refund', body: "A freeze means the receiving bank has been asked to hold the amount. It is not yet a refund — the restoration step comes next." },
  restoration_path: { title: 'Restoration after a hold', body: 'Once an amount shows as held, a restoration request can be filed against your 14-digit case number. Where a court order is needed, DLSA or Lok Adalat routes may help.' },
  bank_escalate_rbios: { title: 'If your bank does not resolve it', body: "If the bank hasn't resolved your dispute in 30 days, or rejects it, you can file free with the RBI Ombudsman." },
  fir_ladder: { title: 'A complaint is not an FIR', body: 'If no FIR exists after a reasonable time, you can submit a written application to the police station, then the Superintendent of Police, then a Magistrate. SahAI prepares each draft at the right time.' },
  zero_fir_any_ps: { title: 'Zero FIR', body: 'A police station can record information regardless of jurisdiction and transfer it. This prototype prepares documents but does not file them.' },
  status_rti: { title: 'Ask for a written status', body: 'At day 30, an RTI can ask the cyber cell for the current stage, assigned officer, and steps taken.' },
  evidence_basics: { title: 'Preserve originals', body: "Keep screenshots showing URLs, handles, and dates; bank statements; SMS; call logs; and emails with headers. Note exact times and don't edit or crop originals." },
  digital_arrest_truths: {
    title: 'Hang up now',
    body: "No Indian agency arrests anyone over a video call, keeps people in 'digital custody', or asks for money to avoid arrest. Any such call is a scam; real notices come in writing.",
    titleHi: 'कॉल अभी काटें',
    bodyHi: "कोई भी भारतीय एजेंसी वीडियो कॉल पर गिरफ़्तारी या 'डिजिटल कस्टडी' नहीं करती, न ही गिरफ़्तारी से बचने के लिए पैसे माँगती है। ऐसा कोई भी कॉल धोखा है।",
  },
  ncii_takedown_24h: { title: 'Request urgent removal', body: 'Platforms are required to act quickly on intimate or impersonating imagery. Your grievance-officer takedown draft is ready in the case file.' },
  ncii_stopncii: { title: 'Use StopNCII', body: 'StopNCII.org can block images across participating platforms using a fingerprint created on your device; the images do not leave your phone.' },
  ncii_do_not_pay: { title: 'Do not pay', body: 'Paying a sextortionist almost never deletes content. Takedown and reporting is the safer path.' },
  evidence_capture_ncii: { title: 'Capture only what is necessary', body: 'Before blocking, capture profile URLs, handles, threat messages, and dates. Do not share or download intimate content.' },
  csam_do_not_download: { title: 'Never download or forward', body: 'Possession may itself be an offence. Record URLs and surrounding context only; specialised units handle the material.' },
  csam_urls_only: { title: 'URLs are enough', body: 'Record the URL, platform, account handle, and date. Do not save or forward the content.' },
  gac_path: { title: 'Escalate to GAC', body: "If a platform's Grievance Officer does not resolve the complaint in 15 days, you can appeal to the Grievance Appellate Committee within the applicable window." },
  helpline_181: { title: 'Immediate human support', body: 'The Women Helpline 181 can connect callers to counselling and local assistance.' },
  impersonation_warn_contacts: { title: 'Warn your contacts', body: 'Tell contacts that the profile is fake and to ignore payment requests or links sent in your name.' },
  takedown_24h_impersonation: { title: 'Request profile removal', body: 'Send the ready grievance-officer letter and preserve proof of submission.' },
  recovery_checklist: { title: 'Secure the account', body: 'Use official recovery, set a new unique password and 2FA, check forwarding rules and connected apps, sign out all sessions, and warn contacts.' },
  credential_rotation: { title: 'Change reused passwords', body: 'Start with email and banking. Turn on two-factor authentication everywhere it is available.' },
  ransomware_do_not_pay: { title: 'Do not pay the ransom', body: 'Payment guarantees nothing and funds the crime. Preserve the ransom note and seek expert help.' },
  ransom_do_not_pay: { title: 'Do not pay the ransom', body: 'Payment guarantees nothing and funds the crime. Preserve the ransom note and seek expert help.' },
  decryptor_check: { title: 'Check for a free decryptor', body: 'NoMoreRansom.org may have a free tool for known ransomware families.' },
  isolate_machine: { title: 'Isolate the device', body: 'Disconnect it from networks and external drives. Preserve its current state for a responder.' },
  certin_what: { title: 'Prepare a CERT-In report', body: "CERT-In is India's national incident response team. A ready-made incident email is in your case file for you to send from your own mailbox." },
  chakshu_how: { title: 'Report suspicious communication', body: "Use Sanchar Saathi's Chakshu to report suspicious calls, SMS, or messaging accounts." },
  tafcop_how: { title: 'Audit SIMs in your name', body: 'Use TAFCOP on Sanchar Saathi to find and disconnect unknown mobile connections.' },
  simswap_check: { title: 'Check for SIM swap', body: "If your SIM went dead around the fraud, call your telecom provider's fraud line from another phone immediately." },
  card_block_now: { title: 'Block the card first', body: 'Block the card using the official bank app or helpline. Blocking does not affect your dispute.' },
  investment_no_more_deposits: { title: 'Send no more money', body: "Do not deposit more to 'unlock' a withdrawal. That demand is part of the scam." },
  loanapp_harassment: { title: 'Record harassment', body: 'Preserve threats and morphed-photo messages; they belong in the complaint.' },
  loanapp_warn_contacts: { title: 'Pre-warn contacts', body: 'Tell contacts the app may message them. This removes part of the extortion leverage.' },
  crypto_exchange_report: { title: 'Notify the exchange', body: "If a transfer touched an exchange, use that exchange's official fraud-reporting channel quickly." },
  bec_bank_recall: { title: 'Ask for a transfer recall', body: 'Request an immediate recall from your bank in writing. Minutes matter.' },
};

export function getGuidance(keys: string[], language = 'en') {
  return keys.map((key) => {
    const item = guidance[key] ?? { title: key.replaceAll('_', ' '), body: 'Follow the next step shown in your case timeline.' };
    const useHindi = language.startsWith('hi');
    return { key, title: useHindi && item.titleHi ? item.titleHi : item.title, body: useHindi && item.bodyHi ? item.bodyHi : item.body };
  });
}
