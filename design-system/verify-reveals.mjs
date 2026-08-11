#!/usr/bin/env node
/**
 * Scroll-reveal visibility check — run this alongside the captures.
 *
 * WHY IT EXISTS
 * The capture harness screenshots with `reducedMotion: 'reduce'`, which trips the
 * prefers-reduced-motion override and force-shows every `.reveal`. That is correct
 * for deterministic screenshots, but it makes the captures BLIND to the worst
 * failure mode of scroll-driven animation: an element whose `animation-range`
 * never resolves stays invisible forever, and no screenshot will ever show it.
 *
 * That shipped once — an `animation-range` mixing named ranges (`entry X%` start,
 * `cover Y%` end) left card 4 of the first-visit grid invisible at 375 and cards
 * 3+4 at 768, on a page whose captures all looked perfect.
 *
 * This drives a real browser with motion ON, scrolls each page top to bottom like
 * a user, and fails if any `.reveal` is left below full opacity.
 *
 * TWO PASSES, and the first one matters most. Pass 1 disables the `.is-revealed`
 * IntersectionObserver safety net so the CSS is judged ALONE; pass 2 runs the page
 * exactly as shipped. Without pass 1 this script is near-worthless: the safety net
 * force-reveals anything on screen, so a page with genuinely broken range math
 * passes. That is not hypothetical — the first fix for the bug above still left
 * card 4 at opacity 0.409 and the net alone was hiding it.
 *
 * Usage: node design-system/verify-reveals.mjs [page.html ...]
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['index.html', 'services.html', 'about.html', 'locations.html', 'contact.html'];
const WIDTHS = [375, 414, 600, 768, 1024, 1440];

const browser = await chromium.launch();
let checked = 0, failed = 0;

// Pass 1 judges the CSS alone; pass 2 judges the page as users receive it.
const PASSES = [
  { name: 'css-only (JS visibility floor DISABLED)', disableNet: true },
  { name: 'as shipped (JS visibility floor active)', disableNet: false },
];

for (const pass of PASSES) {
console.log(`\n── ${pass.name} ──`);
for (const page of pages) {
  const file = join(SITE, page);
  if (!existsSync(file)) { console.log(`  SKIP ${page} (not found)`); continue; }
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 812 } }); // motion ON
    const p = await ctx.newPage();
    if (pass.disableNet) {
      // Swallow only the `is-revealed` class so the safety net cannot mask a
      // scroll-range defect. Everything else in site.js runs normally.
      await p.addInitScript(() => {
        const add = DOMTokenList.prototype.add;
        DOMTokenList.prototype.add = function (...c) {
          return add.apply(this, c.filter(x => x !== 'is-revealed'));
        };
      });
    }
    await p.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });
    await p.evaluate(async () => {
      const step = Math.round(innerHeight * 0.75);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y); await new Promise(r => setTimeout(r, 110));
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 500));
    });
    await p.waitForTimeout(600);
    const faded = await p.evaluate(() =>
      [...document.querySelectorAll('.reveal')]
        .map(e => ({ cls: e.className.replace(/\s*reveal\s*/, ' ').trim().split(' ')[0] || 'reveal',
                     op: parseFloat(getComputedStyle(e).opacity) }))
        .filter(x => x.op < 0.99));
    checked++;
    if (faded.length) {
      failed++;
      console.log(`  FAIL ${page} @${w}  ${faded.length} reveal(s) not fully visible: ` +
        faded.map(f => `${f.cls}=${f.op.toFixed(2)}`).join(', '));
    }
    await ctx.close();
  }
}
}
await browser.close();
console.log(`\n${checked - failed}/${checked} page+width combos across both passes: ` +
            `every .reveal fully visible after scroll-through (motion ON)`);
process.exit(failed ? 1 : 0);
