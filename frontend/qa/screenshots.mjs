// QA screenshots: node qa/screenshots.mjs [outDir]
// Ops drawer shot needs OPS_AUTH="user:pass" in the environment (see backend/.env).
import { chromium } from 'playwright';

const out = process.argv[2] ?? './qa/shots';
const base = process.env.APP_URL ?? 'http://localhost:3000';
const opsAuth = process.env.OPS_AUTH ?? '';

const browser = await chromium.launch();
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });

async function shot(ctx, path, name, ms = 600) {
  const p = await ctx.newPage();
  await p.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(ms);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await p.close();
  console.log('shot', name);
}

await shot(desktop, '/', 'd-landing');
await shot(phone, '/', 'p-landing');
await shot(desktop, '/call', 'd-call-idle');
await shot(desktop, '/call?preview=1', 'd-call-live-preview');
await shot(phone, '/call?preview=1', 'p-call-live-preview');
await shot(desktop, '/track?demo=1', 'd-track-demo', 1500);
await shot(desktop, '/about', 'd-about');

if (opsAuth) {
  const p = await desktop.newPage();
  await p.goto(`${base}/ops`, { waitUntil: 'networkidle' });
  const [user, pass] = opsAuth.split(':');
  await p.fill('input[placeholder="user"]', user);
  await p.fill('input[placeholder="password"]', pass);
  await p.getByRole('button', { name: 'Enter' }).click();
  await p.waitForSelector('table');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/d-ops.png`, fullPage: true });
  console.log('shot d-ops');
}

await browser.close();
