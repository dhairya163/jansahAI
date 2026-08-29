import express from 'express';
import cors from 'cors';
import { desc, eq } from 'drizzle-orm';
import { config } from './config.js';
import { db } from './db/client.js';
import { cases } from './db/schema.js';
import { realtimeRouter } from './routes/realtime.js';
import { toolsRouter } from './routes/tools.js';
import { casesRouter } from './routes/cases.js';
import { artifactsRouter } from './routes/artifacts.js';
import { opsRouter, jobsRouter } from './routes/ops.js';
import { categoryLabel, statusLabel } from './engine/labels.js';
import { virtualDay } from './engine/clocks.js';

const app = express();

// CORS: APP_BASE_URL may be a comma-separated origin list; trailing slashes are
// forgiven; localhost always works; in demo mode, Vercel preview URLs are allowed
// too so every deploy Just Works (CORS is not the security boundary here — OTP/JWT/
// basic-auth gates are).
const allowedOrigins = new Set(
  [config.appBaseUrl, 'http://localhost:3000', 'http://127.0.0.1:3000']
    .flatMap((s) => s.split(','))
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
);
app.use(cors({
  credentials: false,
  origin: (origin, cb) => {
    if (!origin) { cb(null, true); return; }               // curl / same-origin / health checks
    const o = origin.replace(/\/+$/, '');
    const ok = allowedOrigins.has(o) || (config.demoMode && /^https:\/\/[a-z0-9.-]+\.vercel\.app$/i.test(o));
    cb(null, ok);
  },
}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, name: config.appName, demo: config.demoMode }));

app.use('/api/realtime', realtimeRouter);
app.use('/api/tools', toolsRouter);
app.use('/api/cases', casesRouter);
app.use('/api/artifacts', artifactsRouter);
app.use('/api/ops', opsRouter);
app.use('/api/jobs', jobsRouter);

/** §27 demo picker — seeded personas, one click from /track?demo=1 (DEMO_MODE only; safe subset). */
app.get('/api/demo/cases', async (_req, res) => {
  if (!config.demoMode) { res.status(403).json({ error: { code: 'demo_off', message: 'DEMO_MODE is off.' } }); return; }
  const rows = await db.select().from(cases).where(eq(cases.keepForDemo, true)).orderBy(desc(cases.createdAt)).limit(20);
  res.json({
    demo_otp: config.otpFixedCode,
    cases: rows.filter((c) => c.status !== 'draft' && (c.slots as Record<string, unknown>)?.demo_persona).map((c) => ({
      case_number: c.caseNumber,
      category_label: categoryLabel(c.category),
      status_label: statusLabel(c.status),
      status: c.status,
      anonymous: c.anonymous,
      virtual_day: virtualDay(c),
      persona: (c.slots as Record<string, unknown>)?.demo_persona ?? null,
    })),
  });
});

// JSON error envelope (§19)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong.' } });
});

app.listen(config.port, () => {
  console.log(`Jansah.AI backend listening on :${config.port} (demo=${config.demoMode}, realtime=${config.realtimeModel})`);
});
