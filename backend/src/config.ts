import 'dotenv/config';

const number = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const poolerUrl = (port: number) => {
  const host = process.env.SUPABASE_DB_HOST;
  const user = process.env.SUPABASE_DB_USER;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!host || !user || !password) return undefined;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
};

export const config = {
  port: number(process.env.PORT, 4000),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  demoMode: process.env.DEMO_MODE !== 'false',
  otpCode: process.env.OTP_FIXED_CODE ?? '424242',
  jwtSecret: process.env.JWT_SECRET ?? 'sahai-local-development-secret-change-me',
  opsBasicAuth: process.env.OPS_BASIC_AUTH ?? 'admin:sahai-demo',
  cronSecret: process.env.CRON_SECRET ?? 'sahai-local-cron-secret',
  openaiApiKey: process.env.OPENAI_API_KEY,
  realtimeModel: process.env.REALTIME_MODEL ?? 'gpt-realtime-mini',
  realtimeVoice: process.env.REALTIME_VOICE ?? 'marin',
  transcriptionModel: process.env.REALTIME_TRANSCRIPTION_MODEL ?? 'gpt-live-transcribe',
  orchestratorModel: process.env.ORCHESTRATOR_MODEL ?? 'gpt-4o-mini',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  databaseUrl: process.env.DATABASE_URL ?? poolerUrl(number(process.env.SUPABASE_DB_PORT, 6543)),
  directDatabaseUrl: process.env.DIRECT_URL ?? poolerUrl(number(process.env.SUPABASE_DB_DIRECT_PORT, 5432)),
  resendApiKey: process.env.RESEND_API_KEY,
  mailFrom: process.env.MAIL_FROM ?? 'SahAI Desk <complaints@shipjoy.io>',
  mailReplyTo: process.env.MAIL_REPLY_TO ?? 'complaints@shipjoy.io',
  opsEmail: process.env.OPS_EMAIL ?? 'complaints@shipjoy.io',
  maxSessionMinutes: number(process.env.MAX_SESSION_MINUTES, 10),
  maxSessionsPerDay: number(process.env.MAX_SESSIONS_PER_DAY, 50),
  purgeDays: number(process.env.PURGE_DAYS, 7),
} as const;
