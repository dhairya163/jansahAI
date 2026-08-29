import { CATEGORY_KEYS } from '../engine/playbooks.js';

/** §18.3 — register exactly these tools with the Realtime session. */

export const TOOLS = [
  {
    type: 'function', name: 'classify_category',
    description: 'Set the crime category once clear.',
    parameters: {
      type: 'object', required: ['category'],
      properties: {
        category: { type: 'string', enum: CATEGORY_KEYS },
        on_behalf_of: { type: 'boolean' },
        anonymous: { type: 'boolean' },
      },
    },
  },
  {
    type: 'function', name: 'set_slots',
    description: 'Save confirmed complaint fields.',
    parameters: {
      type: 'object', required: ['patch'],
      properties: { patch: { type: 'object', additionalProperties: true } },
    },
  },
  {
    type: 'function', name: 'send_aadhaar_otp',
    description: 'Send the mock Aadhaar OTP (appears as an on-screen SMS). Pass the LAST 4 digits only.',
    parameters: {
      type: 'object', required: ['aadhaar_last4'],
      properties: { aadhaar_last4: { type: 'string', pattern: '^[0-9]{4}$' } },
    },
  },
  {
    type: 'function', name: 'verify_otp',
    description: 'Verify the 6-digit OTP the caller read out (identity or status lookup).',
    parameters: {
      type: 'object', required: ['code'],
      properties: { code: { type: 'string', pattern: '^[0-9]{6}$' } },
    },
  },
  {
    type: 'function', name: 'capture_contact',
    description: 'Save contact details (email optional; phone stored masked).',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string' }, email: { type: 'string' },
        reporter_name: { type: 'string' }, victim_name: { type: 'string' },
      },
    },
  },
  {
    type: 'function', name: 'register_case',
    description: 'Register the complaint after the caller confirms the full read-back. Returns the 14-digit case number.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function', name: 'lookup_case',
    description: 'Find a case by its 14-digit number (status flow).',
    parameters: {
      type: 'object', required: ['case_number'],
      properties: { case_number: { type: 'string', pattern: '^[0-9]{14}$' } },
    },
  },
  {
    type: 'function', name: 'send_status_otp',
    description: 'Send the status-lookup OTP for the case found via lookup_case.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function', name: 'get_status',
    description: 'Get the verified case status: timeline, next clock, artifacts.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function', name: 'withdraw_case',
    description: 'Withdraw the complaint (requires verified status OTP in this session; confirm twice with the caller first).',
    parameters: {
      type: 'object', required: ['confirm'],
      properties: { confirm: { type: 'boolean' } },
    },
  },
  {
    type: 'function', name: 'check_suspect',
    description: 'Check a suspect identifier (UPI/phone/account/URL/email/handle) against the repository of prior reports.',
    parameters: {
      type: 'object', required: ['kind', 'value'],
      properties: {
        kind: { type: 'string', enum: ['phone', 'upi', 'bank_account', 'url', 'email', 'handle'] },
        value: { type: 'string' },
      },
    },
  },
  {
    type: 'function', name: 'get_guidance',
    description: 'Fetch the reviewed guidance strings for a category (optionally one topic). Read them verbatim.',
    parameters: {
      type: 'object', required: ['category'],
      properties: { category: { type: 'string' }, topic: { type: 'string' } },
    },
  },
] as const;
