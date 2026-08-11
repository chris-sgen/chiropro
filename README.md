# ChiroPro — static site mockup

Review preview for **ChiroPro**, a fictional multi-location chiropractic practice
(Riverside · Northgate · Harbourside). This is a design mockup, not a real
business and not a production website. All names, practitioners, testimonials,
addresses and phone numbers are invented — phone numbers use the reserved
`555-01xx` fiction range.

**Live preview:** https://chris-sgen.github.io/chiropro/

## Pages

| Page | Purpose |
| --- | --- |
| [`index.html`](index.html) | Homepage — hero, conditions, locations, booking |
| [`about.html`](about.html) | Three clinics, three practitioners |
| [`services.html`](services.html) | What we treat and how |
| [`locations.html`](locations.html) | Riverside, Northgate & Harbourside |
| [`contact.html`](contact.html) | Book, call, or ask a question |

## Design references

| Page | Purpose |
| --- | --- |
| [`design-system.html`](design-system.html) | Tokens, type scale, components, motion |
| [`brand-card.html`](brand-card.html) | Brand direction — palette, voice, imagery |
| [`lock-preview.html`](lock-preview.html) | Bundle C · §4 — the locked homepage direction |

`404.html` is served by GitHub Pages for any unknown URL under the project.

## Structure

```
design-system/tokens.css      design tokens (colour, type, space, motion)
design-system/structural.css  layout + component CSS
design-system/site.js         scroll reveals, nav, interaction
assets/                       photography and textures
favicon.svg                   brand mark — the four-vertebra spine
apple-touch-icon.png          180x180 raster of the same mark
icon-512.png                  512x512 raster of the same mark
assets/og-cover.jpg           1200x630 social card
sitemap.xml                   XML sitemap (sitemap.yaml is the build plan, not this)
```

The build tooling alongside the CSS (`capture.mjs`, `stitch.py`, `verify-*.mjs`)
is Playwright capture and rhythm verification used while building; it is not
needed to serve the site.

`favicon.svg`, `apple-touch-icon.png`, `icon-512.png` and `assets/og-cover.jpg`
are generated rather than hand-drawn, so they cannot drift from the design
system. To regenerate after a token or hero-image change:

```sh
node design-system/render-og.mjs
```

It renders `design-system/og-cover.src.html` — which links the real `tokens.css`
and the real hero photograph — and rasterises `favicon.svg`. It exits non-zero if
a webfont or the hero image failed to load, so a silently degraded social card
cannot be published.

## Serving locally

Any static server works. The five site pages use relative paths only:

```sh
python -m http.server 8000
# then open http://localhost:8000/
```

`404.html` is the one exception — it uses root-relative `/chiropro/…` paths so it
survives being served for a deep missing URL, which means it only renders
correctly on the deployed site, not from disk.

## Notes

- Indexing is disabled two ways: `robots.txt` disallows everything, and every
  page carries `<meta name="robots" content="noindex, nofollow">` in case a
  crawler reaches a page without having fetched `robots.txt`. This is a review
  deployment and should not compete with, or be mistaken for, a real practice.
- `.nojekyll` is present so GitHub Pages serves the files as-is.
- Responsive QA screenshots (375 / 768 / 1024 / 1440 captures) are kept out of
  this repo to keep it small; they live with the local build.

## At production launch

1. Point `<link rel="canonical">` and the `og:`/`twitter:` URLs at the real host.
2. Replace `robots.txt` with the real policy and regenerate `sitemap.xml`
   against that host.
3. Remove the `noindex, nofollow` meta from the five site pages (leave it on
   `404.html` and on the three design-reference pages).
4. Re-point the root-relative paths in `404.html` from `/chiropro/` to `/`.
