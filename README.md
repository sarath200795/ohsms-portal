# WE EHS — OHSMS Portal

Enterprise occupational health & safety management system: 14 integrated HSE modules
(incidents, risk assessments, permits to work, LOTO, audits, CAPA, training, contractors,
inspections, mock drills, emergency equipment, improvements, consultations, occupational
health) in one realtime, multi-tenant, site-scoped portal — plus a QR-code field portal for
no-login incident reporting and a 3D interactive landing page.

## Stack

- **React 19 + Vite 8** — two independent SPA builds (main app, field portal)
- **Tailwind CSS v4** — semantic design tokens, "Trust & Authority" design system
- **Firebase** — Realtime Database + Auth (swappable for any REST backend at runtime via `/setup`)
- **Zustand** — live session store with realtime permission sync
- **react-three-fiber** — interactive 3D hero on the landing page

## Quick start

```bash
npm install
cp .env.example .env   # fill in your Firebase web config
npm run dev
```

- `/` — public landing page
- `/login` — portal sign-in (Firebase Auth)
- `/setup` — runtime database configuration (no redeploy needed)
- `/field-portal.html?org={orgId}&site={site}` — field worker reporting form (dev)

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `build:field-portal` / `build:all` | Production builds |
| `npm run test:platform` | Unit tests (Node built-in runner) |
| `npm run lint` | ESLint, zero warnings |
| `npm run firebase:deploy` | Deploy main app + rules |
| `npm run firebase:deploy:field-portal` | Deploy field portal |

## Architecture in one paragraph

Every operational module is a **declarative config** in `src/modules/registry.js`, rendered by
a single engine (`src/components/ModulePage.jsx`) — realtime list, stats, search, filters and
validated forms come free per module. Data access goes through an adapter layer
(`src/services/db`) so the portal runs on Firebase RTDB or any RTDB-shaped REST API, selected
at runtime. Three roles (Global Owner / Site Owner / User) are normalized by
`src/utils/permissions.js` and enforced per-route, per-record-scope and in realtime via a live
profile subscription. See `CLAUDE.md` for the full architecture guide.
