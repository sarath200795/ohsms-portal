# WE EHS Suite Launch

The WE EHS Suite launch page, built 1:1 from the Claude Design source
(**WE EHS Suite Launch.dc.html** — artifact "Occupation Health Safety App UI").

A pure static site — no build step, no framework:

- `index.html` — the full page: Modernist design system (Archivo, `#f3f2f2` ground,
  `#ec3013` accent, sharp corners, 2px ink rules), hero, nine scroll-pinned
  assembly scenes (Fire Marshal, HECP·LOTO, Permit to Work, HIRA, Incident·IRA,
  Inspections, Internal Audit, HSE Committee, WE EHS Hub), modules grid, Hub
  mock, shared-foundation strip, demo table and launch CTA.
- `js/assembly.js` — the scroll-driven assembly animation, ported unchanged from
  the design's script (exploded parts converge per scene, legends fade in,
  progress bars track; honors `prefers-reduced-motion`).
- `fonts/` — self-hosted Archivo woff2 subsets from the design bundle.

## Run locally

Any static server works:

```bash
npx serve .
```
