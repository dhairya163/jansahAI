import { Router, type Request, type Response, type NextFunction } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { voiceSessions, cases, type VoiceSessionRow } from '../db/schema.js';
import { sha256 } from '../lib/ids.js';
import { opsBasicAuth } from '../middleware/auth.js';
import {
  requestHandoff, openHandoffForSession, getHandoff, listHandoffs,
  acceptHandoff, postHumanMessage, postCitizenMessage, closeHandoff,
} from '../engine/handoff.js';

export const handoffRouter = Router();

async function sessionFromToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers['x-session-token'];
  if (typeof token !== 'string') { res.status(401).json({ error: { code: 'unauthorized', message: 'X-Session-Token required' } }); return; }
  const [s] = await db.select().from(voiceSessions).where(eq(voiceSessions.sessionTokenHash, sha256(token))).orderBy(desc(voiceSessions.startedAt)).limit(1);
  if (!s) { res.status(401).json({ error: { code: 'unauthorized', message: 'Unknown session' } }); return; }
  (req as Request & { session: VoiceSessionRow }).session = s;
  next();
}
const sess = (req: Request) => (req as Request & { session: VoiceSessionRow }).session;

// ── citizen side (call page) ────────────────────────────────────────────────
handoffRouter.post('/handoff', sessionFromToken, async (req, res) => {
  const s = sess(req);
  const [c] = s.caseId ? await db.select().from(cases).where(eq(cases.id, s.caseId)) : [];
  const reason = typeof (req.body as { reason?: string })?.reason === 'string' ? (req.body as { reason: string }).reason.slice(0, 300) : undefined;
  const { handoff, already } = await requestHandoff({ session: s, caseRow: c ?? null, reason, source: 'button' });
  res.json({ id: handoff.id, status: handoff.status, already });
});

handoffRouter.get('/handoff/mine', sessionFromToken, async (req, res) => {
  const open = await openHandoffForSession(sess(req).id);
  if (!open) { res.json({ handoff: null, messages: [] }); return; }
  res.json(await getHandoff(open.id));
});

handoffRouter.post('/handoff/:id/message', sessionFromToken, async (req, res) => {
  const text = String((req.body as { text?: string })?.text ?? '').trim().slice(0, 1000);
  if (!text) { res.status(422).json({ error: { code: 'empty', message: 'text required' } }); return; }
  try { await postCitizenMessage(String(req.params.id), sess(req).id, text); res.json({ ok: true }); }
  catch (err) { res.status(409).json({ error: { code: 'inactive', message: (err as Error).message } }); }
});

handoffRouter.post('/handoff/:id/close', sessionFromToken, async (req, res) => {
  const open = await openHandoffForSession(sess(req).id);
  if (!open || open.id !== String(req.params.id)) { res.status(404).json({ error: { code: 'not_found', message: 'No active handoff' } }); return; }
  await closeHandoff(open.id, 'citizen');
  res.json({ ok: true });
});

// ── ops side (console) ──────────────────────────────────────────────────────
handoffRouter.get('/ops/handoffs', opsBasicAuth, async (req, res) => {
  const status = typeof req.query.status === 'string' && req.query.status ? [req.query.status] : ['queued', 'accepted'];
  res.json({ handoffs: await listHandoffs(status) });
});

handoffRouter.get('/ops/handoffs/:id', opsBasicAuth, async (req, res) => {
  const h = await getHandoff(String(req.params.id));
  if (!h) { res.status(404).json({ error: { code: 'not_found', message: 'No handoff' } }); return; }
  res.json(h);
});

handoffRouter.post('/ops/handoffs/:id/accept', opsBasicAuth, async (req, res) => {
  const name = String((req.body as { name?: string })?.name ?? 'Jansah desk').trim().slice(0, 40) || 'Jansah desk';
  try { const row = await acceptHandoff(String(req.params.id), name); res.json({ ok: true, status: row.status }); }
  catch (err) { res.status(404).json({ error: { code: 'not_found', message: (err as Error).message } }); }
});

handoffRouter.post('/ops/handoffs/:id/message', opsBasicAuth, async (req, res) => {
  const text = String((req.body as { text?: string })?.text ?? '').trim().slice(0, 1000);
  if (!text) { res.status(422).json({ error: { code: 'empty', message: 'text required' } }); return; }
  try { await postHumanMessage(String(req.params.id), text); res.json({ ok: true }); }
  catch (err) { res.status(409).json({ error: { code: 'inactive', message: (err as Error).message } }); }
});

handoffRouter.post('/ops/handoffs/:id/close', opsBasicAuth, async (req, res) => {
  await closeHandoff(String(req.params.id), 'ops');
  res.json({ ok: true });
});
