import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:4000',

  openaiApiKey: req('OPENAI_API_KEY'),
  realtimeModel: process.env.REALTIME_MODEL ?? 'gpt-realtime',
  textModel: process.env.TEXT_MODEL ?? 'gpt-4.1-mini',
  transcribeModel: process.env.TRANSCRIBE_MODEL ?? 'gpt-4o-transcribe',
  realtimeVoice: process.env.REALTIME_VOICE ?? 'marin',
  // mic pickup / turn detection (server VAD) — lower threshold = more sensitive
  vadThreshold: Number(process.env.VAD_THRESHOLD ?? 0.3),
  vadPrefixMs: Number(process.env.VAD_PREFIX_MS ?? 400),
  vadSilenceMs: Number(process.env.VAD_SILENCE_MS ?? 600),
  // caption transcription steering (script bias lives in realtime.ts; override here if needed)
  transcribeLanguage: process.env.TRANSCRIBE_LANGUAGE ?? '',
  transcribePrompt: process.env.TRANSCRIBE_PROMPT ?? '',

  supabaseUrl: req('SUPABASE_URL'),
  supabaseSecretKey: req('SUPABASE_SECRET_KEY'),
  supabasePublishableKey: req('SUPABASE_PUBLISHABLE_KEY'),
  databaseUrl: req('DATABASE_URL'),
  artifactsBucket: process.env.ARTIFACTS_BUCKET ?? 'artifacts',

  resendApiKey: process.env.RESEND_API_KEY ?? '',
  mailFrom: process.env.MAIL_FROM ?? 'Jansah.AI <onboarding@resend.dev>',
  mailReplyTo: process.env.MAIL_REPLY_TO ?? '',
  opsBccEmail: process.env.OPS_BCC_EMAIL ?? '',

  opsBasicAuth: process.env.OPS_BASIC_AUTH ?? 'ops:ops',
  cronSecret: process.env.CRON_SECRET ?? 'cron-secret',
  jwtSecret: req('JWT_SECRET'),
  otpFixedCode: process.env.OTP_FIXED_CODE ?? '424242',
  demoMode: (process.env.DEMO_MODE ?? 'true') === 'true',
  maxSessionMinutes: Number(process.env.MAX_SESSION_MINUTES ?? 10),
  maxSessionsPerDay: Number(process.env.MAX_SESSIONS_PER_DAY ?? 50),
  purgeDays: Number(process.env.PURGE_DAYS ?? 7),

  appName: 'Jansah.AI',
} as const;
