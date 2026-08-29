/** Human labels for categories & statuses (EN/HI) + indicative statute lines per category (§21 fir_pack). */

export interface Bi { en: string; hi: string }

export const CATEGORY_LABELS: Record<string, Bi> = {
  financial_upi: { en: 'UPI fraud', hi: 'UPI धोखाधड़ी' },
  financial_card: { en: 'Card fraud / SIM-swap', hi: 'कार्ड धोखाधड़ी / सिम-स्वैप' },
  financial_netbanking: { en: 'Internet-banking fraud', hi: 'इंटरनेट बैंकिंग धोखाधड़ी' },
  financial_wallet: { en: 'E-wallet fraud', hi: 'ई-वॉलेट धोखाधड़ी' },
  financial_investment: { en: 'Investment / trading-app scam', hi: 'निवेश / ट्रेडिंग ऐप घोटाला' },
  financial_loan_app: { en: 'Instant-loan-app extortion', hi: 'लोन ऐप उगाही' },
  financial_job_fraud: { en: 'Online job fraud', hi: 'ऑनलाइन नौकरी धोखाधड़ी' },
  financial_courier_customs: { en: 'Courier / customs ("parcel") scam', hi: 'कूरियर / कस्टम्स ("पार्सल") घोटाला' },
  financial_matrimonial: { en: 'Matrimonial fraud', hi: 'वैवाहिक धोखाधड़ी' },
  financial_crypto: { en: 'Cryptocurrency fraud', hi: 'क्रिप्टोकरेंसी धोखाधड़ी' },
  financial_bec: { en: 'Business email compromise', hi: 'बिज़नेस ईमेल धोखाधड़ी' },
  financial_sextortion_paid: { en: 'Sextortion (money paid)', hi: 'सेक्सटॉर्शन (पैसे दिए गए)' },
  digital_arrest_paid: { en: 'Digital arrest (money paid)', hi: 'डिजिटल अरेस्ट (पैसे दिए गए)' },
  wc_ncii: { en: 'Non-consensual intimate imagery', hi: 'बिना सहमति की निजी तस्वीरें' },
  wc_csam_report: { en: 'Child sexual abuse material (report)', hi: 'बाल यौन शोषण सामग्री (रिपोर्ट)' },
  wc_stalking: { en: 'Cyberstalking / harassment', hi: 'साइबर पीछा / उत्पीड़न' },
  social_impersonation: { en: 'Impersonation / fake profile', hi: 'फर्ज़ी प्रोफ़ाइल / पहचान की चोरी' },
  account_takeover: { en: 'Account takeover / hacking', hi: 'अकाउंट हैक' },
  hacking_ransomware: { en: 'Hacking / ransomware', hi: 'हैकिंग / रैनसमवेयर' },
  telecom_fraud: { en: 'Suspicious calls / SMS (no loss)', hi: 'संदिग्ध कॉल / SMS (कोई नुकसान नहीं)' },
  digital_arrest_no_loss: { en: 'Digital arrest attempt (no loss)', hi: 'डिजिटल अरेस्ट की कोशिश (कोई नुकसान नहीं)' },
  generic_other: { en: 'Other cybercrime', hi: 'अन्य साइबर अपराध' },
};

export const STATUS_LABELS: Record<string, Bi> = {
  draft: { en: 'Draft', hi: 'मसौदा' },
  registered: { en: 'Complaint registered', hi: 'शिकायत दर्ज' },
  under_process: { en: 'Being worked', hi: 'कार्रवाई जारी' },
  stalled: { en: 'Stalled — action needed', hi: 'रुकी हुई — कदम ज़रूरी' },
  escalated_l1: { en: 'Escalated to SP', hi: 'SP को भेजा' },
  escalated_l2: { en: 'Escalated to court draft', hi: 'अदालत हेतु मसौदा' },
  fir_registered: { en: 'FIR registered', hi: 'FIR दर्ज' },
  resolved: { en: 'Resolved', hi: 'समाधान' },
  withdrawn: { en: 'Withdrawn', hi: 'वापस ली गई' },
  closed: { en: 'Closed', hi: 'बंद' },
};

/** Indicative cognizable-offence lines for the FIR pack (§7 research; template fidelity only — §7.9 verify-note). */
export const SECTIONS_LINE: Record<string, string> = {
  financial_upi: 'IT Act ss.66C/66D; BNS s.318(4) (cheating)',
  financial_card: 'IT Act ss.66C/66D; BNS s.318(4) (cheating)',
  financial_netbanking: 'IT Act ss.66C/66D; BNS s.318(4) (cheating)',
  financial_wallet: 'IT Act ss.66C/66D; BNS s.318(4) (cheating)',
  financial_investment: 'IT Act s.66D; BNS ss.318(4), 316 (criminal breach of trust)',
  financial_loan_app: 'BNS ss.308 (extortion), 351 (criminal intimidation); IT Act s.66D',
  financial_job_fraud: 'IT Act s.66D; BNS s.318(4) (cheating)',
  financial_courier_customs: 'IT Act s.66D; BNS ss.318(4), 319(2) (cheating by personation)',
  financial_matrimonial: 'IT Act s.66D; BNS s.318(4) (cheating)',
  financial_crypto: 'IT Act ss.66C/66D; BNS s.318(4) (cheating)',
  financial_bec: 'IT Act ss.66C/66D; BNS ss.318(4), 336 (forgery of electronic record)',
  financial_sextortion_paid: 'IT Act ss.67/67A; BNS ss.308 (extortion), 351 (criminal intimidation)',
  digital_arrest_paid: 'IT Act s.66D; BNS ss.318(4), 319(2), 351',
  wc_ncii: 'IT Act ss.66E/67/67A; BNS ss.77 (voyeurism), 351',
  wc_csam_report: 'IT Act s.67B; POCSO ss.13–15',
  wc_stalking: 'BNS ss.78 (stalking), 75, 79; IT Act s.66E as applicable',
  social_impersonation: 'IT Act ss.66C/66D; BNS ss.319(2), 336',
  account_takeover: 'IT Act ss.43/66, 66C',
  hacking_ransomware: 'IT Act ss.43/66, 65; BNS s.308 where ransom is demanded',
  telecom_fraud: 'IT Act ss.66C/66D (attempt), as applicable on facts',
  digital_arrest_no_loss: 'BNS ss.319(2), 351; IT Act s.66D (attempt)',
  generic_other: 'as applicable on the stated facts',
};

export const TRACK_LABELS: Record<string, Bi> = {
  financial: { en: 'Financial fraud', hi: 'वित्तीय धोखाधड़ी' },
  women_children: { en: 'Women / children related', hi: 'महिला / बच्चों से संबंधित' },
  other: { en: 'Other cybercrime', hi: 'अन्य साइबर अपराध' },
};

export function categoryLabel(category: string): Bi {
  return CATEGORY_LABELS[category] ?? { en: category, hi: category };
}

export function statusLabel(status: string): Bi {
  return STATUS_LABELS[status] ?? { en: status, hi: status };
}
