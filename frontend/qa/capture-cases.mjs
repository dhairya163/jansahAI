import { chromium } from 'playwright';
const out = 'public/features'; const base = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
async function casePage(want, name) {
  const p = await ctx.newPage();
  await p.goto(`${base}/track?demo=1`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const rows = p.locator('button.row');
  const n = await rows.count();
  const texts = [];
  for (let i = 0; i < n; i++) texts.push((await rows.nth(i).innerText()).replace(/\s+/g, ' '));
  console.log(name, 'rows:', texts);
  const idx = texts.findIndex((t) => /UPI/i.test(t) && new RegExp(want).test(t));
  if (idx < 0) { console.log('no match'); await p.close(); return; }
  await rows.nth(idx).click();
  await p.waitForSelector('input[maxlength="6"]', { timeout: 15000 });
  await p.fill('input[maxlength="6"]', '424242');
  await p.getByRole('button', { name: 'Verify' }).click();
  await p.waitForURL('**/case/**', { timeout: 15000 });
  await p.waitForSelector('.steps', { timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/${name}.png` });
  await p.close();
  console.log('shot', name);
}
await casePage('Being worked', 'case-day0');
await casePage('Stalled', 'case-day15');
await browser.close();
