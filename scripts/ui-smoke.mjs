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

  // Click the first HIGH-severity finding and confirm it highlights in the doc
  // AND that the highlight lands inside the visible viewport (alignment check).
  const high = page.locator('.comment.s-HIGH').first();
  await high.click();
  await sleep(1800);
  const hlCount = await page.locator('.page .hl').count();
  console.log('highlight rectangles drawn:', hlCount);
  console.log('page indicator:', await page.locator('#pageind').textContent());
  if (hlCount > 0) {
    const hl = await page.locator('.page .hl').first().boundingBox();
    const pane = await page.locator('#docpane').boundingBox();
    const hlMid = hl.y + hl.height / 2;
    const inView = hlMid >= pane.y && hlMid <= pane.y + pane.height;
    console.log(`highlight midY=${Math.round(hlMid)} vs viewport [${Math.round(pane.y)}, ${Math.round(pane.y + pane.height)}] -> ${inView ? 'ALIGNED' : 'OFF-SCREEN'}`);
  }
  await page.screenshot({ path: `${outDir}/review-highlight.png` });

  // Resize the split by dragging the gutter left, to show it's adjustable.
  const g = await page.locator('#gutter').boundingBox();
  await page.mouse.move(g.x + 3, g.y + 200);
  await page.mouse.down();
  await page.mouse.move(g.x - 250, g.y + 200, { steps: 8 });
  await page.mouse.up();
  await sleep(400);
  await page.screenshot({ path: `${outDir}/review-resized.png` });

  // Chat is always visible below findings; ask a question, confirm bubbles render.
  const findingsVisible = await page.locator('#comments .comment').first().isVisible();
  const chatVisible = await page.locator('#chatinput').isVisible();
  console.log(`findings visible=${findingsVisible}, chat visible=${chatVisible} (both should be true)`);
  await page.fill('#chatinput', 'What is the retainage percentage?');
  await page.click('#chatsend');
  await page.waitForSelector('.cmsg.bot', { timeout: 30000 });
  await sleep(500);
  const userMsg = await page.locator('.cmsg.user').count();
  const botText = await page.locator('.cmsg.bot').last().textContent();
  console.log(`chat: user bubbles=${userMsg}, bot reply="${(botText || '').slice(0, 80)}"`);
  await page.screenshot({ path: `${outDir}/review-chat.png` });

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
