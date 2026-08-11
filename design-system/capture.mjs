import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
const STITCH = new URL('./stitch.py', import.meta.url).pathname.replace(/^\//, '');

const ROOT = 'C:/Users/USER/Code/web-mockup/chiropro';
const OUT  = `${ROOT}/assets`;
mkdirSync(OUT, { recursive: true });

const PAGES = process.argv[2]
  ? JSON.parse(process.argv[2])
  : [['brand-card.html','brand-card'], ['index.html','homepage'], ['design-system.html','design-system']];
// realistic device viewports — a width*0.72 height put 375 at 270px tall,
// which parks position:fixed chrome mid-page in a full-page capture
const VIEWPORTS = [[1440,900],[1024,768],[768,1024],[375,812]];

const browser = await chromium.launch();
let n = 0; const problems = [];

for (const [file, name] of PAGES) {
  const src = `${ROOT}/${file}`;
  if (!existsSync(src)) { problems.push(`${file} missing`); continue; }
  for (const [w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', r => errs.push('requestfailed: ' + r.url().split('/').pop()));

    await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });

    // loading="lazy" is correct for production, but a full-page screenshot never
    // scrolls, so anything past ~3 viewport heights stays unloaded and captures
    // blank. Walk the page to trigger every lazy image, then return to the top.
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 90));
      }
      window.scrollTo(0, 0);
      await new Promise(r => setTimeout(r, 120));
    });
    // Block until every <img> has actually decoded.
    await page.evaluate(() => Promise.all(
      [...document.images].filter(i => !i.complete).map(i => i.decode().catch(() => {}))
    ));
    await page.waitForTimeout(350);

    const unloaded = await page.$$eval('img',
      els => els.filter(e => e.naturalWidth === 0).map(e => e.getAttribute('src')));
    if (unloaded.length) problems.push(`${name}@${w}: ${unloaded.length} image(s) never loaded -> ${unloaded.join(', ')}`);
    if (errs.length) problems.push(`${name}@${w}: ${[...new Set(errs)].slice(0, 3).join(' | ')}`);

    const out = `${OUT}/chiropro-${name}-${w}.png`;
    // Chromium's full-page screenshot surface caps at 2**14 = 16384px; anything
    // taller comes back as blank white pixels with NO error. The 375 homepage is
    // 16680px, so its footer was silently missing from the capture. Clipped
    // screenshots are not subject to the cap, so tall pages are captured in
    // bands and stitched.
    const pageH = await page.evaluate(() => document.body.scrollHeight);
    const CAP = 16384;
    if (pageH <= CAP) {
      await page.screenshot({ path: out, fullPage: true });
    } else {
      const BAND = 8000;
      const bands = [];
      for (let y = 0; y < pageH; y += BAND) {
        const h = Math.min(BAND, pageH - y);
        const bp = `${OUT}/.band-${name}-${w}-${y}.png`;
        await page.screenshot({ path: bp, fullPage: true, clip: { x: 0, y, width: w, height: h } });
        bands.push(bp);
      }
      execFileSync('python', [STITCH, out, String(w), String(pageH), ...bands], { stdio: 'pipe' });
      bands.forEach(bp => { try { unlinkSync(bp); } catch {} });
      console.log(`    (stitched ${bands.length} bands — page ${pageH}px exceeds the ${CAP}px screenshot cap)`);
    }
    console.log(`  ${name.padEnd(14)} ${String(w).padStart(4)}  ${String(unloaded.length ? 'IMG GAP' : 'ok').padEnd(8)} -> chiropro-${name}-${w}.png`);
    n++;
    await ctx.close();
  }
}
await browser.close();
console.log(`\n${n} captures written`);
if (problems.length) { console.log('\nPROBLEMS:'); problems.forEach(p => console.log('  ! ' + p)); process.exitCode = 1; }
else console.log('every image decoded · no console, page or request errors at any breakpoint');
