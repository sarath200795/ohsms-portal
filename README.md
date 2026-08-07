# WE EHS Suite Launch

Interactive 3D launch page for **WE EHS — OHSMS** (occupational health & safety management
suite). A single-page React site with a full-viewport three.js scene that responds to pointer
movement, scroll and clicks, honoring `prefers-reduced-motion`.

## Stack

- React 19 + Vite 8
- Tailwind CSS v4 (semantic tokens, "Trust & Authority" palette, Plus Jakarta Sans)
- three.js via @react-three/fiber (code-split chunk)

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # serve the production build
```
