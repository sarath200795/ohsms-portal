# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                    # Start Vite dev server (main app; field-portal.html also served)
npm run build                  # Build main app → dist/
npm run build:field-portal     # Build field portal → dist-field-portal/ (entry renamed to index.html)
npm run build:all              # Build both in sequence

npm run test:platform          # Run all Node built-in unit tests (no test runner install needed)
node --test tests/permissions.test.mjs   # Run a single test file

npm run lint                   # Lint src + tests (zero warnings allowed)
npm run lint:full              # Lint everything

npm run firebase:deploy        # Build + deploy main app to Firebase Hosting
npm run firebase:deploy:field-portal  # Build + deploy field portal to Firebase Hosting
npm run firebase:rules         # Deploy RTDB security rules only (database.rules.json)
```

Tests use the Node built-in test runner (`node --test`) — no Jest, no Vitest.

## Architecture

Ground-up rebuild (2026). React 19 + Vite 8 + Tailwind v4 + Zustand + Firebase RTDB, with a
react-three-fiber 3D scene on the public landing page.

### Two Independent Vite Builds

| Build | Entry | Config | Output | Hosting target |
|---|---|---|---|---|
| Main enterprise app | `index.html` → `src/main.jsx` → `App.jsx` | `vite.config.js` | `dist/` | `app` |
| Standalone field portal | `field-portal.html` → `src/fieldPortalMain.jsx` → `FieldPortalApp.jsx` | `vite.field-portal.config.js` | `dist-field-portal/` | `fieldportal` |

Both are SPAs with `/* → /index.html` rewrites. The field portal is a no-login incident
reporting form for field workers reached via QR codes carrying `?org={orgId}&site={siteName}`.
Its build renames `field-portal.html` → `index.html` via a small vite plugin so Firebase
hosting rewrites work.

### Config-Driven Module System (the key pattern)

All 14 operational modules (incidents, riskAssessments, ptwRecords, lotoProcedures, auditPlans,
capaActions, trainings, contractors, inspectionRecords, mockDrills, emergencyEquipment,
improvements, consultations, healthCases) are **declarative configs** in
`src/modules/registry.js` — id, collection, icon, statuses, field definitions, list columns.
One engine, `src/components/ModulePage.jsx`, renders every module: realtime list, stat cards,
search, status filter, validated create/edit modal, delete confirm. **To add a module, add a
config object to the registry** (and its id to `MODULE_IDS` in `src/utils/permissions.js`);
routes and navigation pick it up automatically.

Field types supported by the form engine: `text`, `textarea`, `date`, `number`, `select`,
`site` (site picker, auto-locked for site-scoped users), `person`.

### Database & Auth Adapter Pattern

**Never import from `firebase/database` or `firebase/auth` directly in components or pages.**
All data and auth calls go through the service layer:

```js
import { dbGet, dbPush, dbUpdate, dbRemove, dbSet, dbSubscribe, orgGet, orgPush, orgSubscribe, toRecords } from '../services/db/index.js';
import authService from '../services/auth/index.js';
```

The active adapter is selected at module-load time from `localStorage('ohsms_db_adapter')` →
`VITE_DB_ADAPTER` env var → `'firebase'` (default). Adapters: `firebase` (RTDB realtime) and
`rest` (RTDB-shaped JSON API; subscriptions poll every 15s). The `/setup` page writes runtime
config to `localStorage` so orgs can switch databases without a redeploy. Auth is
Firebase-only; the REST adapter covers data access.

`toRecords(value)` converts an RTDB object map into an array with `id`s sorted by `createdAt`
descending — use it for every collection read.

### Multi-Tenancy Data Model

All org data lives under `organizations/${orgId}/` in Firebase RTDB. `userDirectory/${uid}/orgId`
maps a Firebase Auth UID to its organization. RTDB security rules (`database.rules.json`)
enforce org isolation and `status === 'Active'`.

Collections under `organizations/${orgId}/`: `sites`, `users`, plus one collection per module
config (`collection` key in the registry).

### RBAC and Permissions

Three roles in `src/utils/permissions.js`:

- **Global Owner** — every module including Users and Sites; site access is `All Sites`
- **Site Owner** — every module except the global Sites registry, scoped to `assignedSite`; can manage users at their site
- **User** — `dashboard` plus only the modules listed in `accessibleModules` (management modules can never be self-granted)

`normalizeSessionPermissions()` is the authoritative function that expands role-granted modules
and normalizes site access — call it whenever building or validating a session.
`scopeRecordsToSite()` filters collection reads for non-global users; records without a `site`
field remain visible (legacy tolerance).

### Session Flow

1. `authService.login()` signs in, resolves org + profile, writes a normalized session to `sessionStorage('isoSession')` via `writeStoredSession()` (`src/utils/session.js`)
2. `ProtectedRoute` reads `readStoredSession()` on every navigation and enforces per-module access via its `moduleId` prop
3. `useStore` (Zustand, `src/store/useStore.js`) holds the live session and subscribes to `organizations/${orgId}/users/${uid}` — permission edits apply in real time, deactivation logs the user out immediately
4. The field portal uses a separate `sessionStorage('fieldPortalSession')` key (reporter name only, no auth)

### Design System

"Trust & Authority" (selected via the ui-ux-pro-max skill). Semantic tokens are defined in
`src/index.css` under `@theme` — components use token utilities (`bg-primary`, `text-ink`,
`text-soft`, `border-line`, `bg-canvas`, `bg-night`…), **never raw hex**. Font: Plus Jakarta
Sans. Shared primitives (Button, Card, Badge/StatusBadge, Field, Input/Select/Textarea, Modal,
StatCard, EmptyState, Spinner, PageHeader) live in `src/components/ui.jsx`.

Dashboard chart colors: the severity palette (`#0891b2/#f59e0b/#dc2626/#7c3aed`) passed the
dataviz skill's colorblind-safety validator; the amber slice is below 3:1 contrast so the donut
legend always shows label + count. Keep those constraints if you change chart colors.

The landing page (`src/pages/Landing.jsx`) hosts the lazy-loaded react-three-fiber scene
(`src/components/three/SafetyScene.jsx`); it honors `prefers-reduced-motion` (static frame,
`frameloop='demand'`) and the `three` chunk is split in `vite.config.js`.

## Environment Variables

Copy `.env.example` to `.env`. Required Firebase vars: `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
Optional: `VITE_DB_ADAPTER` (`firebase` | `rest`), `VITE_REST_API_BASE_URL`,
`VITE_FIELD_PORTAL_URL` (landing-page link to the deployed field portal).

The `/setup` page at runtime can override all of this via `localStorage`
(`ohsms_firebase_config`, `ohsms_db_adapter`, `ohsms_rest_config`).

## MCP Servers & Skills

`.mcp.json` registers the 21st.dev component MCP server (HTTP transport). It reads the API key
from the `TWENTYFIRST_API_KEY` environment variable — set it in your shell (or Claude Code
environment settings) before starting a session; the key itself is never committed because this
repo is public.

`.claude/skills/` contains the UI/UX Pro Max skill suite (installed via
`npx ui-ux-pro-max-cli init --ai claude`): `ui-ux-pro-max`, `ui-styling`, `design`,
`design-system`, `brand`, `banner-design`, and `slides`.
