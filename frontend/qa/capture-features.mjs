import { chromium } from 'playwright';
const out = 'public/features';
const base = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });

async function shot(path, name, wait = 900, prep) {
  const p = await ctx.newPage();
  await p.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  if (prep) await prep(p);
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `${out}/${name}.png` });
  await p.close();
  console.log('shot', name);
}

await shot('/call?preview=1', 'call-live');
await shot('/call?preview=handoff', 'call-handoff');
await shot('/call?preview=phone', 'call-phone');
await shot('/patterns', 'patterns', 1800);

async function casePage(pickText, name) {
  const p = await ctx.newPage();
  await p.goto(`${base}/track?demo=1`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const rows = p.locator('button.row');
  const n = await rows.count();
  let clicked = false;
  for (let i = 0; i < n; i++) {
    const t = (await rows.nth(i).innerText()).replace(/\s+/g, ' ');
    if (t.includes('UPI fraud') && t.includes(pickText)) { await rows.nth(i).click(); clicked = true; break; }
  }
  if (!clicked) { console.log('row not found for', pickText); await p.close(); return; }
  await p.waitForSelector('input[maxlength="6"]');
  await p.fill('input[maxlength="6"]', '424242');
  await p.getByRole('button', { name: 'Verify' }).click();
  await p.waitForURL('**/case/**');
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/${name}.png` });
  await p.close();
  console.log('shot', name);
}
await casePage('day 0', 'case-day0');
await casePage('day 15', 'case-day15');
await browser.close();
