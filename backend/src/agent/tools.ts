const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const REALTIME_TOOLS = [
  { type: 'function', name: 'set_session_language', description: 'Lock the session language after a substantive user utterance. Use hi for Hindi, hi-en for Hinglish, and en for English.', parameters: object({ language: { type: 'string', enum: ['en', 'hi', 'hi-en'] } }, ['language']) },
  { type: 'function', name: 'classify_category', description: 'Set the cybercrime category once clear.', parameters: object({ category: { type: 'string', enum: ['financial_upi','financial_card','financial_netbanking','financial_wallet','financial_investment','financial_loan_app','financial_job_fraud','financial_courier_customs','financial_matrimonial','financial_crypto','financial_bec','financial_sextortion_paid','digital_arrest_paid','wc_ncii','wc_csam_report','wc_stalking','social_impersonation','account_takeover','hacking_ransomware','telecom_fraud','digital_arrest_no_loss','generic_other'] }, on_behalf_of: { type: 'boolean' }, anonymous: { type: 'boolean' } }, ['category']) },
  { type: 'function', name: 'set_slots', description: 'Save confirmed complaint fields.', parameters: object({ patch: { type: 'object', additionalProperties: true } }, ['patch']) },
  { type: 'function', name: 'send_aadhaar_otp', description: 'Send the fixed mock identity-verification code.', parameters: object({ aadhaar_last4: { type: 'string', pattern: '^[0-9]{4}$' } }, ['aadhaar_last4']) },
  { type: 'function', name: 'verify_otp', description: 'Verify a six-digit mock OTP.', parameters: object({ code: { type: 'string', pattern: '^[0-9]{6}$' } }, ['code']) },
  { type: 'function', name: 'capture_contact', description: 'Capture optional contact details.', parameters: object({ phone: { type: 'string' }, email: { type: 'string' }, reporter_name: { type: 'string' }, victim_name: { type: 'string' } }) },
  { type: 'function', name: 'register_case', description: 'Register the confirmed draft case.', parameters: object({}) },
  { type: 'function', name: 'lookup_case', description: 'Check whether a 14-digit case exists without exposing details.', parameters: object({ case_number: { type: 'string', pattern: '^[0-9]{14}$' } }, ['case_number']) },
  { type: 'function', name: 'send_status_otp', description: 'Send the mock status lookup OTP.', parameters: object({}) },
  { type: 'function', name: 'get_status', description: 'Return verified case status and next step.', parameters: object({}) },
  { type: 'function', name: 'withdraw_case', description: 'Withdraw only after verified status access and confirmation.', parameters: object({ confirm: { type: 'boolean' } }, ['confirm']) },
  { type: 'function', name: 'check_suspect', description: 'Check a suspect identifier in the local seeded repository.', parameters: object({ kind: { type: 'string', enum: ['phone','upi','bank_account','url','email','handle'] }, value: { type: 'string' } }, ['kind','value']) },
  { type: 'function', name: 'get_guidance', description: 'Get reviewed procedural guidance for a category.', parameters: object({ category: { type: 'string' }, topic: { type: 'string' } }, ['category']) },
];
