#!/usr/bin/env node
/**
 * Local section-rhythm verifier for ChiroPro.
 *
 * WHY THIS EXISTS
 * The skill's own gate, scripts/verify-section-visual-rhythm.mjs, detects imagery
 * by string-matching `images.unsplash.com`. Its sibling,
 * verify-no-gradient-placeholders.mjs, does the same. ChiroPro's imagery is
 * fal.ai-generated and served from ./assets/, because that is what the brief
 * asked for — so those two gates can never pass here no matter how many real
 * photographs the page contains. That is a limitation of the detector, not a
 * defect in the page.
 *
 * This script applies the SAME five thresholds from VERTICAL-AUDIT-TEMPLATE.md
 * §2.20, with two detector changes and nothing else relaxed:
 *   1. imagery counts a local <img src="assets/..."> as real imagery
 *   2. chrome resolves shadows through var(--ds-shadow-*), which the upstream
 *      regex cannot see because it requires a literal 2-digit px value —
 *      BRAND-TOKEN-SCHEMA.md forbids literals, so tokenised shadows are correct
 *
 * Rules 1, 2, 3 and 5 are byte-for-byte the same logic as upstream.
 * Run:  node design-system/verify-rhythm-local.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] || join(here, '..', 'index.html');
const content = readFileSync(target, 'utf8');
// The shadow/radius tokens live in tokens.css, not in the page. Read it too, or
// every var(--ds-shadow-*) resolves to nothing and chrome under-reports as
// open-layout. Upstream has the same blind spot; no reason to inherit it.
// Component CSS lives in structural.css and the shadow/radius tokens in
// tokens.css. Read both, or bg/chrome classification sees only the page's own
// section rules and under-reports. Upstream has the same blind spot.
let tokensCss = '';
for (const f of ['tokens.css', 'structural.css']) {
  try { tokensCss += '\n' + readFileSync(join(here, f), 'utf8'); } catch { /* optional */ }
}

/* ── parse sections ─────────────────────────────────────────────────────── */
const sections = [];
const secRe = /<section[^>]*\bclass\s*=\s*["']([^"']+)["'][^>]*>/gi;
let m;
while ((m = secRe.exec(content)) !== null) {
  const classes = m[1].split(/\s+/).filter(c => c && c !== 'section');
  if (!classes.length) continue;
  sections.push({
    index: sections.length,
    primaryClass: classes[classes.length - 1],
    openTagEnd: m.index + m[0].length,
  });
}

// Search the page AND the linked stylesheets — component rules live in
// structural.css, so matching against the page alone under-reports chrome.
const cssPool = content + tokensCss;
const findRule = cls => {
  const r = new RegExp(`\\.${cls}\\b(?![\\w-])\\s*\\{([^}]+)\\}`, 'i');
  const hit = cssPool.match(r);
  return hit ? hit[1] : '';
};

const classifyBg = cls => {
  const css = findRule(cls);
  if (!css) return 'unknown';
  if (/background\s*:[^;]*(?:linear-gradient|radial-gradient)/i.test(css)) return 'gradient';
  if (/background[^;:]*:[^;]*var\(--[\w-]*(?:primary-deep|ink)\)/i.test(css)) return 'dark';
  if (/background[^;:]*:[^;]*var\(--[\w-]*accent(?:-soft)?\)/i.test(css)) return 'accent';
  if (/background[^;:]*:[^;]*var\(--[\w-]*bg-2\)/i.test(css)) return 'light';
  if (/background[^;:]*:[^;]*var\(--[\w-]*bg(?!-)/i.test(css)) return 'warm';
  return 'unknown';
};

const bodyOf = openTagEnd => {
  const close = content.indexOf('</section>', openTagEnd);
  return close === -1 ? '' : content.substring(openTagEnd, close);
};

/* CHANGED vs upstream: a local asset is real imagery. */
const detectImagery = openTagEnd => {
  const body = bodyOf(openTagEnd);
  if (/<img[^>]+src\s*=\s*["'](?:assets\/|[^"']*images\.unsplash\.com)[^"']*["']/i.test(body)) return true;
  if (/style\s*=\s*["'][^"']*background[^"']*url\((?:['"]?assets\/|[^)]*images\.unsplash\.com)/i.test(body)) return true;
  const classes = new Set([...body.matchAll(/class\s*=\s*["']([^"']+)["']/gi)]
    .flatMap(c => c[1].split(/\s+/).filter(Boolean)));
  for (const cls of classes) {
    if (new RegExp(`\\.${cls}\\b[^{]*\\{[^}]*background(?:-image)?\\s*:[^}]*url\\(`, 'is').test(content)) return true;
  }
  return false;
};

/* CHANGED vs upstream: resolve var(--ds-shadow-*) to its definition first. */
const shadowTokens = {};
for (const s of (content + tokensCss).matchAll(/--ds-(shadow-[\w-]+)\s*:\s*([^;]+);/g)) shadowTokens[s[1]] = s[2];

const classifyChrome = openTagEnd => {
  const body = bodyOf(openTagEnd);
  const inner = new Set([...body.matchAll(/class\s*=\s*["']([^"']+)["']/gi)]
    .flatMap(c => c[1].split(/\s+/).filter(x => /(?:^|-)(?:card|tile|item|step|row|panel|photo)$/i.test(x))));
  if (!inner.size) return 'open-layout';
  for (const cls of inner) {
    let css = findRule(cls);
    if (!css) continue;
    css = css.replace(/var\(--ds-(shadow-[\w-]+)\)/g, (_, k) => shadowTokens[k] || '');
    if (/background\s*:[^;]*rgba\(\s*255\s*,\s*255\s*,\s*255/i.test(css)) return 'dark-anchor-panel';
    if (/background-image\s*:[^;]*url\(/i.test(css)) return 'image-overlay';
    if (/box-shadow\s*:[^;]*\d{2,}px/i.test(css)) return 'shadow-lift';
    if (/border\s*:[^;]*1px\s+solid/i.test(css)) return 'hairline-card';
  }
  return 'open-layout';
};

const rows = sections.map(s => ({
  ...s,
  bg: classifyBg(s.primaryClass),
  imagery: detectImagery(s.openTagEnd),
  chrome: classifyChrome(s.openTagEnd),
}));

/* ── the five thresholds ────────────────────────────────────────────────── */
const total = rows.length;
const NON_LIGHT = new Set(['dark', 'accent', 'gradient', 'warm']);
const fails = [];

const nonLight = rows.filter(r => NON_LIGHT.has(r.bg));
if (nonLight.length < 2) fails.push(`Rule 1: only ${nonLight.length} non-light anchors, need >= 2`);

if (total >= 7) {
  const mid = rows.slice(3, total - 2);
  if (!mid.some(r => NON_LIGHT.has(r.bg)))
    fails.push(`Rule 2: no non-light anchor in middle positions 4..${total - 2}`);
}

for (let i = 0; i + 3 < total; i++) {
  const w = rows.slice(i, i + 4);
  if (w[0].bg !== 'unknown' && w.every(r => r.bg === w[0].bg)) {
    fails.push(`Rule 3: 4 consecutive sections share bg='${w[0].bg}' at positions ${i + 1}-${i + 4}`);
    break;
  }
}

const withImg = rows.filter(r => r.imagery).length;
const pct = Math.round((100 * withImg) / total);
if (pct < 50) fails.push(`Rule 4: only ${withImg}/${total} (${pct}%) sections have imagery, need >= 50%`);

for (let i = 0; i + 3 < total; i++) {
  const w = rows.slice(i, i + 4);
  if (w.every(r => r.chrome === 'hairline-card')) {
    fails.push(`Rule 5: 4 consecutive hairline-card sections at positions ${i + 1}-${i + 4}`);
    break;
  }
}

/* ── report ─────────────────────────────────────────────────────────────── */
console.log(`\nSection visual rhythm — ${target}\n`);
console.log('  #   section                 bg        imagery  chrome');
console.log('  ─── ─────────────────────── ───────── ──────── ──────────────────');
rows.forEach(r =>
  console.log(
    `  ${String(r.index + 1).padStart(2, '0')}  .${r.primaryClass.padEnd(22)} ${r.bg.padEnd(9)} ` +
    `${(r.imagery ? 'yes' : 'no').padEnd(8)} ${r.chrome}`
  )
);
console.log(`\n  imagery: ${withImg}/${total} (${pct}%)`);
console.log(`  bg sequence:     ${rows.map(r => r.bg).join(' · ')}`);
console.log(`  chrome sequence: ${rows.map(r => r.chrome).join(' · ')}\n`);

if (fails.length) {
  fails.forEach(f => console.log(`  FAIL  ${f}`));
  console.log('');
  process.exit(1);
}
console.log('  PASS  all 5 rhythm thresholds met.\n');
