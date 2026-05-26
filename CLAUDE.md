# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                    # Start Vite dev server (main app)
npm run build                  # Build main app → dist/
npm run build:field-portal     # Build field portal → dist-field-portal/
npm run build:all              # Build both in sequence

npm run test:platform          # Run all Node built-in unit tests (no test runner install needed)
npm run test:phase1            # Run permissions + user-access tests only
node --test tests/permissions.test.mjs   # Run a single test file

npm run lint                   # Lint a curated subset of changed files
npm run lint:full              # Lint the entire src tree

npm run firebase:deploy        # Build + deploy main app to Firebase Hosting
npm run firebase:deploy:field-portal  # Build + deploy field portal to Firebase Hosting
npm run firebase:rules         # Deploy RTDB security rules only (database.rules.json)
```

Tests use the Node built-in test runner (`node --test`) — no Jest, no Vitest. E2E tests use Playwright (`npm run test:e2e`).

## Architecture

### Two Independent Vite Builds

The repo produces two separate SPAs:

| Build | Entry | Config | Output | Hosting target |
|---|---|---|---|---|
| Main enterprise app | `src/main.jsx` → `App.jsx` | `vite.config.js` | `dist/` | `app` |
| Standalone field portal | `src/fieldPortalMain.jsx` → `FieldPortalApp.jsx` | `vite.field-portal.config.js` | `dist-field-portal/` | `fieldportal` |

Both are pure SPAs with `/* → /index.html` rewrites. The field portal is a lightweight subset of the main app designed for mobile field workers reached via QR codes.

### Database & Auth Adapter Pattern

**Never import from `firebase/database` or `firebase/auth` directly in components or pages.** All data and auth calls go through the service layer:

```js
import { dbGet, dbPush, dbUpdate, dbRemove, dbSet, dbSubscribe, orgGet } from '../../services/db/index.js';
import authService from '../../services/auth/index.js';
```

The active adapter is selected at module-load time from `localStorage('ohsms_db_adapter')` → `VITE_DB_ADAPTER` env var → `'firebase'` (default). The two adapters are `firebase` (RTDB) and `rest` (any REST API). The `/setup` page writes the runtime config to `localStorage` so orgs can switch databases without a redeploy.

Convenience scoped helpers: `orgGet(orgId, 'incidents')` expands to `dbGet('organizations/${orgId}/incidents')`.

### Multi-Tenancy Data Model

All organisation data lives under `organizations/${orgId}/` in Firebase RTDB. The `userDirectory/${uid}/orgId` mapping links a Firebase Auth UID to its organisation. RTDB security rules enforce that a user can only read/write their own org's data and must have `status === 'Active'`.

Collections under `organizations/${orgId}/`: `details`, `sites`, `users`, `userPasswordState`, `permissionRequests`, `accessAuditLogs`, and all module collections (`incidents`, `riskAssessments`, `ptwRecords`, `lotoProcedures`, `auditPlans`, `trainings`, `contractors`, `inspectionTemplates`, `inspectionRecords`, `mockDrills`, `emergencyEquipment`, `improvements`, `consultations`, `healthCases`, etc.).

### RBAC and Permissions

Three roles defined in `src/utils/permissions.js`:

- **Global Owner** — full access to all sites and all modules including Users and Sites management
- **Site Owner** — all modules scoped to their `assignedSite`; can manage users at their site
- **User** — only modules explicitly listed in `accessibleModules`

`normalizeSessionPermissions()` in `permissions.js` is the authoritative function that expands role-granted modules and normalizes site access. Call it whenever building or validating a session.

### Session Flow

1. Login writes a normalized session object to `sessionStorage('isoSession')` via `writeStoredSession()` in `src/utils/session.js`
2. `ProtectedRoute` in `App.jsx` reads `readStoredSession()` on every navigation — no redirect if valid
3. `useStore` (Zustand, `src/store/useStore.js`) holds the live session and opens a `dbSubscribe` listener on `organizations/${orgId}/users/${uid}` to keep permissions fresh in real time
4. Call `useStore.initializeSession(sess)` on every protected page load; call `useStore.clearSession()` on logout

The field portal uses a separate session key `'fieldPortalSession'` and `portalAuth.js` handles its distinct login/bootstrap flow.

### AppExperienceShell

`src/components/AppExperienceShell.jsx` wraps all routes and provides:
- Animated route transition overlay (respects `prefers-reduced-motion`)
- `AppTransitionContext` — call `playTransition({ label, action })` anywhere to animate a navigation
- Tutorial prompt system — shows a one-time video modal per module (keyed in `localStorage('ohsms:tutorial-seen:{id}')`)
- Online/offline detection with a connectivity pill

### CSS and Theme

Tailwind v4 (`@import "tailwindcss"` in `src/index.css`). Light theme using CSS custom properties:
- `--myth-ink` `#0f172a` — primary text
- `--myth-ember` `#f97316` — orange accent / actions
- `--myth-muted` `#64748b` — secondary text
- `--myth-gold` `#f2c978` — decorative accent

**Cascade note**: Unlayered CSS in `index.css` (outside `@layer`) outranks `@layer utilities`. The `.hero-banner .text-white { color: #ffffff !important }` rule keeps the intentional dark hero-banner text white but propagates to white sub-cards inside the hero (stat cards, info pills). Fix white-on-white in hero sub-cards by using `text-[var(--myth-ink)]` directly in JSX rather than relying on the global override.

### Incident AI Backend

The incident smart investigation feature has two deployment modes:
- **Vercel-native** (default): `api/v1.js` serverless function using Vercel Blob storage + Firebase Admin for durable job state. Env vars needed: `BLOB_READ_WRITE_TOKEN`, `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `OPENAI_API_KEY`.
- **External**: point `VITE_INCIDENT_AI_API_BASE_URL` at a Render/external server running `server/incident-ai`.

### Known Tech Debt (from README)

- Attachments are stored as base64 in RTDB — should migrate to Firebase Storage with scoped rules
- The `xlsx` package has unresolved upstream advisories
- User provisioning (create/delete Firebase Auth accounts) currently runs client-side via a secondary Firebase app instance (`ohsms-user-provisioning`) — should move to Admin SDK on the server for stricter enterprise control

## Environment Variables

Copy `.env.example` to `.env`. Required Firebase vars:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_APP_CHECK_SITE_KEY   # optional — enables App Check / reCAPTCHA v3
VITE_DB_ADAPTER                    # optional — 'firebase' (default) or 'rest'
```

The `/setup` page at runtime can override all Firebase config by writing to `localStorage('ohsms_firebase_config')` and `localStorage('ohsms_db_adapter')`.
