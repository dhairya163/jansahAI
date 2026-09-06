import { Router } from 'express';
import { listPatterns, getPattern, radarStats } from '../engine/radar.js';

/** Public scam-radar feed — counts only; no reporter is ever exposed. */
export const patternsRouter = Router();

patternsRouter.get('/', async (_req, res) => {
  const [stats, patterns] = await Promise.all([radarStats(), listPatterns(30)]);
  res.json({ stats, patterns });
});

patternsRouter.get('/:id', async (req, res) => {
  const p = await getPattern(req.params.id);
  if (!p) { res.status(404).json({ error: { code: 'not_found', message: 'No such pattern' } }); return; }
  res.json({ pattern: p });
});
