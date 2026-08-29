/** §17.4 guidance-string catalogue — ENGLISH. The agent reads these verbatim (ADR-4). */

export interface GuidanceString { title: string; body: string }

export const GUIDANCE_EN: Record<string, GuidanceString> = {
  golden_hour: {
    title: 'The golden hour',
    body: "Money moved by fraud usually sits briefly in a mule account before being layered onward. Reporting within the first hour gives the best chance of a hold; even now, faster is better.",
  },
  bank_3day_rule: {
    title: 'Write to your bank within 3 working days',
    body: "Send the written dispute to your own bank within 3 working days of learning of the fraud. Reported in time, RBI's framework can make your liability zero for unauthorised transactions. The letter is ready in your case file — sign and submit it to your branch/bank email, and demand a written acknowledgment.",
  },
  ezero_fir: {
    title: 'e-Zero FIR',
    body: "For losses of ₹10 lakh or more reported via the national portal/1930, a Zero FIR is registered automatically.",
  },
  freeze_meaning: {
    title: 'What a freeze means',
    body: "A 'freeze' means the receiving bank has been asked to hold the amount. It is not yet a refund — the restoration step comes next.",
  },
  restoration_path: {
    title: 'Getting held money back',
    body: "Once an amount shows as held, a restoration request can be filed against your 14-digit case number. Where a court order is needed, legal-services authorities (DLSA/Lok Adalat) increasingly process these without a lawyer.",
  },
  bank_escalate_rbios: {
    title: 'RBI Ombudsman',
    body: "If the bank hasn't resolved your dispute in 30 days (or rejects it), you can file free with the RBI Ombudsman at cms.rbi.org.in within 90 days of their reply.",
  },
  fir_ladder: {
    title: 'The FIR ladder',
    body: "A portal complaint is not an FIR. If no FIR exists after a reasonable time, the law lets you push: a written application to the police station, then to the Superintendent of Police, then to a Magistrate. Each document is prepared for you at the right time.",
  },
  zero_fir_any_ps: {
    title: 'Zero FIR — any police station',
    body: "Any police station must record your complaint regardless of jurisdiction (Zero FIR) and transfer it — you cannot be turned away for 'wrong area'.",
  },
  status_rti: {
    title: 'RTI for case status',
    body: "30 days in, you can file an RTI asking the cyber cell: current stage, officer assigned, steps taken. A reply is legally due in 30 days — and silence itself becomes appealable.",
  },
  evidence_basics: {
    title: 'Evidence basics',
    body: "Keep originals: screenshots showing URL/handle/date, bank statements from the app (PDF), SMS, call logs, emails with full headers. Note exact times. Don't edit or crop.",
  },
  digital_arrest_truths: {
    title: 'No agency arrests over video',
    body: "No Indian agency arrests anyone over a video call, keeps people in 'digital custody', or asks for money to avoid arrest. Any such call is a scam — hang up; real notices come in writing.",
  },
  ncii_takedown_24h: {
    title: '24-hour removal rule',
    body: "Platforms are legally required to remove intimate/impersonating imagery within 24 hours of your complaint to their Grievance Officer. Your takedown letter is ready in the case file.",
  },
  ncii_stopncii: {
    title: 'StopNCII',
    body: "StopNCII.org can block the images across major platforms using a fingerprint (hash) created on your own device — the images never leave your phone.",
  },
  ncii_do_not_pay: {
    title: 'Never pay a sextortionist',
    body: "Do not pay a sextortionist. Payment almost never deletes anything; it marks you as someone who pays. Takedown + reporting is the path.",
  },
  evidence_capture_ncii: {
    title: 'Capture before blocking',
    body: "Before blocking, capture: profile URLs/handles, the threat messages, dates. Screenshots with visible URL bar. Then block.",
  },
  csam_do_not_download: {
    title: 'Never download or forward',
    body: "Never download or forward such material — possession itself is an offence. Record URLs and report; specialised units handle the rest.",
  },
  csam_urls_only: {
    title: 'URLs only',
    body: "Capture URLs and screenshots of surrounding context only — never the material itself. Report via the anonymous track; specialised units handle the rest.",
  },
  gac_path: {
    title: 'Appeal to the GAC',
    body: "If the platform's Grievance Officer doesn't resolve your complaint in 15 days, you can appeal to the government's Grievance Appellate Committee (gac.gov.in) within 30 days.",
  },
  helpline_181: {
    title: 'Women Helpline 181',
    body: "For immediate support, the Women Helpline 181 connects to counselling and local assistance.",
  },
  impersonation_warn_contacts: {
    title: 'Warn your contacts now',
    body: "Impersonation profiles exist to defraud your contacts — warn them with a broadcast message now.",
  },
  takedown_24h_impersonation: {
    title: '24-hour removal for impersonation',
    body: "Content that impersonates you falls in the 24-hour mandatory-removal class once complained to the platform's Grievance Officer. Acknowledgment is due within 24 hours and disposal within 15 days.",
  },
  recovery_checklist: {
    title: 'Account recovery, in order',
    body: "In order: platform's official recovery flow → new strong password + 2FA → check mail forwarding rules & connected apps → sign out all sessions → tell contacts to ignore requests 'from you'.",
  },
  credential_rotation: {
    title: 'Rotate credentials',
    body: "Change the password everywhere it was reused, starting with email and banking. Turn on 2FA.",
  },
  ransom_do_not_pay: {
    title: "Don't pay the ransom",
    body: "Don't pay — payment guarantees nothing and funds the crime. Preserve the ransom note and a sample of encrypted files.",
  },
  decryptor_check: {
    title: 'Check for free decryptors',
    body: "Check NoMoreRansom.org for free decryptors before considering anything else.",
  },
  isolate_machine: {
    title: 'Isolate the machine',
    body: "Disconnect the machine from network and shared drives now; keep it powered as-is until examined.",
  },
  certin_what: {
    title: 'What CERT-In is',
    body: "CERT-In is India's national incident response team. Your ready-made incident email goes to incident@cert-in.org.in from your own mailbox.",
  },
  chakshu_how: {
    title: 'Report on Chakshu',
    body: "Report the fraud call/SMS/WhatsApp on Sanchar Saathi's Chakshu facility (sancharsaathi.gov.in).",
  },
  tafcop_how: {
    title: 'Audit SIMs on TAFCOP',
    body: "Check every SIM issued on your identity at TAFCOP on Sanchar Saathi and disconnect strangers.",
  },
  simswap_check: {
    title: 'SIM-swap warning sign',
    body: "If your SIM suddenly went dead around the fraud, treat it as SIM-swap — call your telco's fraud line from another phone immediately.",
  },
  card_block_now: {
    title: 'Block the card first',
    body: "Block the card on the bank app/helpline first; blocking does not affect your dispute.",
  },
  investment_no_more_deposits: {
    title: 'Not one more rupee',
    body: "Whatever the 'platform' says about unlocking withdrawals — do not deposit another rupee. That demand is the scam's engine.",
  },
  loanapp_harassment: {
    title: 'Record the harassment',
    body: "Record threats; harassment and morphed-photo threats are themselves offences and go in the complaint.",
  },
  loanapp_warn_contacts: {
    title: 'Pre-warn your contacts',
    body: "Pre-warn your contacts that the app may message them; it removes the extortion lever.",
  },
  crypto_exchange_report: {
    title: 'Report to the exchange too',
    body: "If any hop touched an Indian exchange, file that exchange's fraud form too — exchanges can freeze internally faster than banks.",
  },
  bec_bank_recall: {
    title: 'Ask for a recall in writing',
    body: "For wire fraud, ask your bank for an immediate recall/SWIFT recall on the beneficiary bank in writing — minutes matter.",
  },
};
