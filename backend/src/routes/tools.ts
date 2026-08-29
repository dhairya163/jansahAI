import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { voiceSessions } from '../db/schema.js';
import { sha256 } from '../lib/ids.js';
import { redactDeep } from '../lib/redact.js';
import { handleTool, ToolError } from '../agent/toolHandlers.js';

export const toolsRouter = Router();

/**
 * §19 POST /api/tools/:name  (auth: X-Session-Token) — the browser is untrusted transport;
 * every call re-validated server-side against the session's single draft case (§13).
 */
toolsRouter.post('/:name', async (req, res) => {
  const started = Date.now();
  const token = req.headers['x-session-token'];
  if (typeof token !== 'string' || token.length < 20) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'X-Session-Token required' } });
    return;
  }
  const [session] = await db.select().from(voiceSessions)
    .where(eq(voiceSessions.sessionTokenHash, sha256(token)))
    .orderBy(desc(voiceSessions.startedAt)).limit(1);
  if (!session) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Unknown session token' } });
    return;
  }
  if (session.endedAt) {
    res.status(401).json({ error: { code: 'session_ended', message: 'This voice session has ended.' } });
    return;
  }

  const name = req.params.name;
  const args = (req.body?.args ?? req.body ?? {}) as Record<string, unknown>;

  let status = 200;
  let result: Record<string, unknown>;
  try {
    result = await handleTool(name, args, { session });
    res.json({ result });
  } catch (err) {
    if (err instanceof ToolError) {
      status = err.status;
      // the model gets a structured, speakable error — it must never fake success (§18.2)
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
    } else {
      status = 500;
      console.error(`[tools/${name}]`, err);
      res.status(500).json({ error: { code: 'internal', message: 'Tool failed — apologise and retry once.' } });
    }
    result = { error: (err as Error).message };
  }

  const ms = Date.now() - started;
  console.log(`[tool] session=${session.id.slice(0, 8)} tool=${name} ms=${ms} ok=${status === 200}`);
  // §15 voice_sessions.tool_calls — redacted audit trail
  void db.update(voiceSessions).set({
    toolCalls: [
      ...((session.toolCalls as unknown[]) ?? []),
      redactDeep({ name, args, ok: status === 200, ms, at: new Date().toISOString() }),
    ].slice(-200),
  }).where(eq(voiceSessions.id, session.id)).catch(() => { /* audit best-effort */ });
});
