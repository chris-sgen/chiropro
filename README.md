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

## Structure

```
design-system/tokens.css      design tokens (colour, type, space, motion)
design-system/structural.css  layout + component CSS
design-system/site.js         scroll reveals, nav, interaction
assets/                       photography and textures
```

The build tooling that lives alongside the CSS (`capture.mjs`, `stitch.py`,
`verify-*.mjs`) is Playwright capture and rhythm-verification scripting used
while building; it is not needed to serve the site.

## Serving locally

Any static server works — the pages use relative paths only:

```sh
python -m http.server 8000
# then open http://localhost:8000/
```

## Notes

- Indexing is disabled via `robots.txt` — this is a review deployment and should
  not compete with or be mistaken for a real practice's site.
- `.nojekyll` is present so GitHub Pages serves the files as-is.
- Responsive QA screenshots (375 / 768 / 1024 / 1440 captures) are kept out of
  this repo to keep it small; they live with the local build.
