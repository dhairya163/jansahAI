import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { artifacts } from '../db/schema.js';
import { verifyCaseToken } from '../lib/jwt.js';
import { isOps } from '../middleware/auth.js';
import { signedArtifactUrl } from '../lib/supabase.js';

export const artifactsRouter = Router();

/** §19 GET /api/artifacts/:id (case-JWT via ?token= or Bearer | ops basic) → 302 signed URL (60s). */
artifactsRouter.get('/:id', async (req, res) => {
  const [a] = await db.select().from(artifacts).where(eq(artifacts.id, req.params.id));
  if (!a) {
    res.status(404).json({ error: { code: 'not_found', message: 'No such artifact.' } });
    return;
  }
  const header = req.headers.authorization ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token ?? '');
  const payload = bearer ? verifyCaseToken(bearer) : null;
  const authed = isOps(req) || (payload !== null && payload.case_id === a.caseId);
  if (!authed) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Case token or ops auth required.' } });
    return;
  }
  try {
    const url = await signedArtifactUrl(a.storagePath, 60);
    res.redirect(302, url);
  } catch (err) {
    console.error('[artifacts] sign failed:', (err as Error).message);
    res.status(502).json({ error: { code: 'sign_failed', message: 'Could not sign artifact URL.' } });
  }
});
