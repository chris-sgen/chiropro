/* Captures 404.html at the four breakpoints, to
 *   assets/chiropro-404-{1440,1024,768,375}.png
 *
 * Separate from capture.mjs for one reason: 404.html declares
 * <base href="/chiropro/">, so it can only render from an origin where that
 * path resolves. capture.mjs loads pages over file://, where the base would
 * point at file:///chiropro/ and every stylesheet, script and link would 404.
 * So this serves the build root over HTTP and captures the real URL instead —
 * which is also how the page is actually served in production.
 *
 * Run from anywhere:  node design-system/capture-404.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Derived from this file's location so the script survives a clone anywhere.
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = path.basename(SITE);
const SERVE_ROOT = path.dirname(SITE);          // .../web-mockup — so /<slug>/... resolves
const OUT = path.join(SITE, 'assets');

const VIEWPORTS = [[1440, 900], [1024, 768], [768, 1024], [375, 812]];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};

const problems = [];

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let fp = path.join(SERVE_ROOT, url);
  if (url.endsWith('/')) fp = path.join(fp, 'index.html');
  // Contain the handler to the build root — a served path must never escape it.
  if (!path.resolve(fp).startsWith(path.resolve(SERVE_ROOT))) { res.writeHead(403).end(); return; }
  if (!existsSync(fp)) { res.writeHead(404).end('not found'); return; }
  try {
    const body = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(500).end(); }
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const target = `http://127.0.0.1:${port}/${SLUG}/404.html`;
console.log(`serving ${SERVE_ROOT} -> ${target}\n`);

const browser = await chromium.launch();

for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errs.push('requestfailed: ' + r.url()));

  await page.goto(target, { waitUntil: 'networkidle' });
  await page.evaluate(() => Promise.all(
    [...document.images].filter(i => !i.complete).map(i => i.decode().catch(() => {}))));
  await page.waitForTimeout(350);

  // The whole point of <base> is that these resolve. Assert it rather than
  // trusting the screenshot to look right at a glance.
  const cssOk = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.section--dark')).backgroundColor);
  if (cssOk !== 'rgb(36, 56, 75)') problems.push(`@${w}: structural.css did not apply (bg ${cssOk})`);
  const linkOk = await page.evaluate(() =>
    document.querySelector('.nav-links a[href$="services.html"]')?.href ?? '');
  if (!linkOk.includes(`/${'chiropro'}/services.html`)) problems.push(`@${w}: nav link resolved to ${linkOk}`);
  if (errs.length) problems.push(`@${w}: ${[...new Set(errs)].slice(0, 3).join(' | ')}`);

  const out = path.join(OUT, `${SLUG}-404-${w}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`  404  ${String(w).padStart(4)}  ${(errs.length ? 'ERRORS' : 'ok').padEnd(7)} -> ${SLUG}-404-${w}.png`);
  await ctx.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.error('\nPROBLEMS:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\n4/4 captures written; base-relative CSS and links verified at every breakpoint.');
