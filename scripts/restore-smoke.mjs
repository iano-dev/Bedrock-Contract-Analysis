// Verify refresh-restore + back-button guard. Uploads a PDF, opens the review,
// reloads the page (simulating browser refresh) and confirms the same review is
// restored without re-uploading; then exercises the Back-button confirm.
// Usage: node scripts/restore-smoke.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 3461;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PDF = 'test/fixtures/cedar-park-digital.pdf';

// Run with auth + LLM off so analyze is rules-only and deterministic.
const env = { ...process.env, PORT: String(PORT) };
delete env.GOOGLE_CLIENT_ID; delete env.ALLOWED_EMAIL_DOMAINS; delete env.SESSION_SECRET;
delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;

const server = spawn('node', ['web/server.js'], { env, stdio: 'inherit' });
await sleep(1200);
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let failed = false;
const ok = (label, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failed = true; };

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.setInputFiles('#file', PDF);
  await page.click('#analyzeBtn');
  await page.waitForSelector('#review', { state: 'visible', timeout: 60000 });
  await page.waitForSelector('.comment', { timeout: 60000 });
  const docName = await page.locator('#docname').textContent();
  const findingCount = await page.locator('#comments .comment').count();
  console.log(`loaded: doc="${docName}", findings=${findingCount}`);

  // --- REFRESH: reload the page; the review should come back without re-upload ---
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1500);
  const reviewVisible = await page.locator('#review').isVisible();
  const uploadVisible = await page.locator('#upload').isVisible();
  ok('after refresh: review screen is restored (not the upload screen)', reviewVisible && !uploadVisible);
  const findingCount2 = await page.locator('#comments .comment').count();
  ok('after refresh: same findings are present', findingCount2 === findingCount && findingCount2 > 0);
  const canvas2 = await page.locator('.page canvas').count();
  ok('after refresh: the PDF document re-rendered', canvas2 > 0);

  // --- BACK BUTTON: should prompt; cancel keeps the review ---
  page.once('dialog', (d) => { console.log('back dialog:', JSON.stringify(d.message().slice(0, 60))); d.dismiss(); });
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  await sleep(800);
  ok('back + cancel: review still shown', await page.locator('#review').isVisible());

  // --- BACK BUTTON: accept -> returns to upload screen ---
  page.once('dialog', (d) => d.accept());
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  await sleep(800);
  ok('back + confirm: upload screen shown', await page.locator('#upload').isVisible());

  // --- After leaving, a refresh should NOT resurrect the cleared analysis ---
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1000);
  ok('after leaving + refresh: stays on upload screen', await page.locator('#upload').isVisible() && !(await page.locator('#review').isVisible()));

  ok('no uncaught page errors', errors.length === 0);
  if (errors.length) console.log('errors:', errors);
} catch (e) {
  console.error('SMOKE ERROR:', e.message); failed = true;
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
