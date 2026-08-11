/* Renders the deployment image assets from source that already lives in the repo,
 * so none of them can drift from the design system:
 *
 *   design-system/og-cover.src.html  ->  assets/og-cover.jpg      1200x630
 *   favicon.svg                      ->  apple-touch-icon.png      180x180
 *   favicon.svg                      ->  icon-512.png              512x512
 *
 * Run from anywhere:  node design-system/render-og.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync, statSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

// Derived from this file's own location, so the script survives a clone to any
// machine or checkout path. The site root is the parent of design-system/.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => path.join(ROOT, ...p);

const problems = [];
const browser = await chromium.launch();

/* ── 1. Open Graph cover ─────────────────────────────────────────────────── */
{
  const src = at('design-system', 'og-cover.src.html');
  if (!existsSync(src)) problems.push('og-cover.src.html missing');
  else {
    const ctx = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
    // Webfonts are the one thing that silently ruins a social card — the layout
    // is measured against Lexend, so fail loudly rather than ship a fallback.
    // Check the exact weights the card uses: document.fonts.check() matches a
    // specific face, so asking for 400 Lexend reports "missing" on a card that
    // only ever sets 600 — a false alarm that would train us to ignore this gate.
    await page.evaluate(() => document.fonts.ready);
    const missing = await page.evaluate(() =>
      [['Lexend', 600], ['Inter', 400], ['JetBrains Mono', 500]]
        .filter(([f, w]) => !document.fonts.check(`${w} 16px "${f}"`))
        .map(([f, w]) => `${f} ${w}`));
    if (missing.length) problems.push(`og-cover: webfont(s) did not load: ${missing.join(', ')}`);
    const photoOk = await page.evaluate(() => {
      const i = document.querySelector('.bg img');
      return !!i && i.complete && i.naturalWidth > 0;
    });
    if (!photoOk) problems.push('og-cover: hero-clinic.jpg did not load');
    await page.screenshot({ path: at('assets', 'og-cover.jpg'), type: 'jpeg', quality: 90 });
    await ctx.close();
  }
}

/* ── 2 & 3. Raster icons from the SVG mark ───────────────────────────────── */
{
  const svgPath = at('favicon.svg');
  if (!existsSync(svgPath)) problems.push('favicon.svg missing');
  else {
    const svg = readFileSync(svgPath, 'utf8');
    for (const [size, out] of [[180, 'apple-touch-icon.png'], [512, 'icon-512.png']]) {
      const ctx = await browser.newContext({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      const page = await ctx.newPage();
      // The SVG is inlined rather than <img src>'d so it rasterises at the exact
      // viewport size with no scaling blur, and so the page has no network wait.
      await page.setContent(
        `<!DOCTYPE html><style>*{margin:0;padding:0}
         html,body{width:${size}px;height:${size}px;overflow:hidden}
         svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
        { waitUntil: 'load' });
      await page.screenshot({ path: at(out), type: 'png' });
      await ctx.close();
    }
  }
}

await browser.close();

/* ── Report ──────────────────────────────────────────────────────────────── */
for (const f of [['assets', 'og-cover.jpg'], ['apple-touch-icon.png'], ['icon-512.png']]) {
  const p = at(...f);
  const label = f.join('/');
  if (!existsSync(p)) { problems.push(`${label} was not written`); continue; }
  const bytes = statSync(p).size;
  const kb = (bytes / 1024).toFixed(1);
  if (bytes < 1024) problems.push(`${label} is suspiciously small (${kb} KB)`);
  console.log(`  ok  ${label.padEnd(22)} ${kb.padStart(8)} KB`);
}

if (problems.length) {
  console.error('\nPROBLEMS:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nAll deployment image assets rendered.');
