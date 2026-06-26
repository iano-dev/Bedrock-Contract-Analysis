// Drive the web UI in a real browser: upload a PDF, open the split-screen
// reviewer, click a finding, and confirm it highlights in the document.
// Captures screenshots. Usage: node scripts/ui-smoke.mjs <file.pdf> <outdir>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const [, , pdfPath, outDir] = process.argv;
const PORT = 3457;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const server = spawn('node', ['web/server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
await sleep(1200);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url()));
page.on('response', (r) => { if (r.status() === 404) errors.push('404: ' + r.url()); });

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.setInputFiles('#file', pdfPath);
  await page.click('#analyzeBtn');
  await page.waitForSelector('#review', { state: 'visible', timeout: 60000 });
  await page.waitForSelector('.comment', { timeout: 60000 });
  // let the first PDF pages render
  await page.waitForSelector('.page canvas', { timeout: 30000 });
  await sleep(800);
  await page.screenshot({ path: `${outDir}/review-overview.png` });

  // Click the first HIGH-severity finding and confirm it highlights in the doc.
  const high = page.locator('.comment.s-HIGH').first();
  await high.click();
  await sleep(1500);
  const hlCount = await page.locator('.page .hl').count();
  console.log('highlight rectangles drawn:', hlCount);
  await page.screenshot({ path: `${outDir}/review-highlight.png` });

  // Resize the split by dragging the gutter left, to show it's adjustable.
  const g = await page.locator('#gutter').boundingBox();
  await page.mouse.move(g.x + 3, g.y + 200);
  await page.mouse.down();
  await page.mouse.move(g.x - 250, g.y + 200, { steps: 8 });
  await page.mouse.up();
  await sleep(400);
  await page.screenshot({ path: `${outDir}/review-resized.png` });

  console.log('console errors:', errors.length ? errors : 'none');
  console.log('RESULT:', hlCount > 0 ? 'PASS — highlight rendered' : 'WARN — no highlight rects');
} catch (e) {
  console.error('UI smoke failed:', e.message);
  await page.screenshot({ path: `${outDir}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
