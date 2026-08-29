import { Router } from 'express';
import { desc, eq, gte, sql as dsql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { voiceSessions } from '../db/schema.js';
import { config } from '../config.js';
import { mintClientSecret, REALTIME_CALLS_URL } from '../agent/realtime.js';
import { randomToken, sha256 } from '../lib/ids.js';
import { rateLimit } from '../lib/rateLimit.js';
import { clientIp } from '../middleware/auth.js';
import { redact } from '../lib/redact.js';

export const realtimeRouter = Router();

/** §19 POST /api/realtime/session → {client_secret, session_token, expires_at} */
realtimeRouter.post('/session', async (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit(`session:${ip}`, 6, 60 * 60_000)) {
    res.status(429).json({ error: { code: 'rate_limited', message: 'Too many sessions from this IP — try later.' } });
    return;
  }
  // §28 cost guard: MAX_SESSIONS_PER_DAY
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const [row] = await db.select({ n: dsql<number>`count(*)::int` }).from(voiceSessions)
    .where(gte(voiceSessions.startedAt, midnight));
  if ((row?.n ?? 0) >= config.maxSessionsPerDay) {
    res.status(429).json({ error: { code: 'daily_cap', message: 'Daily session cap reached (cost guard). Try tomorrow or use Track.' } });
    return;
  }

  const sessionToken = randomToken();
  const [session] = await db.insert(voiceSessions).values({
    sessionTokenHash: sha256(sessionToken),
    model: config.realtimeModel,
  }).returning();

  try {
    const secret = await mintClientSecret();
    res.json({
      client_secret: secret.value,
      expires_at: secret.expires_at,
      session_token: sessionToken,
      session_id: session.id,
      calls_url: REALTIME_CALLS_URL,
      max_minutes: config.maxSessionMinutes,
      model: config.realtimeModel,
    });
  } catch (err) {
    console.error('[realtime/session] mint failed:', (err as Error).message);
    res.status(502).json({ error: { code: 'mint_failed', message: 'Could not start a voice session. Try again.' } });
  }
});

/** Session close: store redacted transcript + minutes (§15 voice_sessions, §25.2). */
realtimeRouter.post('/end', async (req, res) => {
  const token = req.headers['x-session-token'];
  if (typeof token !== 'string') {
    res.status(401).json({ error: { code: 'unauthorized', message: 'X-Session-Token required' } });
    return;
  }
  const [session] = await db.select().from(voiceSessions)
    .where(eq(voiceSessions.sessionTokenHash, sha256(token)))
    .orderBy(desc(voiceSessions.startedAt)).limit(1);
  if (!session) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Unknown session' } });
    return;
  }
  const body = req.body as { transcript?: { role: string; text: string; at?: string }[] };
  const transcript = Array.isArray(body.transcript)
    ? body.transcript.slice(0, 500).map((t) => ({
      role: t.role === 'user' ? 'user' : 'assistant',
      text: redact(String(t.text ?? '').slice(0, 2000)),
      at: t.at ?? null,
    }))
    : [];
  const ended = new Date();
  const minutes = Math.round(((ended.getTime() - session.startedAt.getTime()) / 60_000) * 100) / 100;
  await db.update(voiceSessions).set({
    endedAt: ended, minutes: String(minutes), transcript,
  }).where(eq(voiceSessions.id, session.id));
  res.json({ ended: true, minutes });
});
