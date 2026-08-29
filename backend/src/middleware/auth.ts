import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export function opsBasicAuth(req: Request, res: Response, next: NextFunction): void {
  if (isOps(req)) { next(); return; }
  res.set('WWW-Authenticate', 'Basic realm="Jansah ops"');
  res.status(401).json({ error: { code: 'unauthorized', message: 'Ops basic auth required' } });
}

export function isOps(req: Request): boolean {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  return decoded === config.opsBasicAuth;
}

export function opsOrCronAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-cron-secret'];
  if (secret === config.cronSecret || isOps(req)) { next(); return; }
  res.status(401).json({ error: { code: 'unauthorized', message: 'Ops auth or CRON secret required' } });
}

export function clientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
}
