# OHSMS Enterprise — Security Review

**Date:** 2026-05-21
**Scope:** Whole stack — React/Vite frontend, NestJS backend (`backend/dist`), Vercel serverless API (`api/v1.js`), Incident-AI services (`server/incident-ai`), Firebase Realtime Database rules (`database.rules.json`), build/deploy config, and dependency/secret hygiene.
**Approach:** Audit + apply fixes for high/low-risk items in place, preserving UI behavior and performance. A few items are flagged for your sign-off because they touch deployment workflow or runtime behavior.

---

## Summary

The application is, on the whole, built with good security instincts. The Firebase rules enforce strict multi-tenant isolation, the verified-auth path validates Firebase ID tokens and re-checks org membership server-side, and the team already pins several transitive dependencies via `overrides`. The most material issues were on the Incident-AI server path (an SSRF vector and a dev-auth-bypass gap on the Vercel deployment), plus standard hardening gaps (env files in git, missing CSP, unsanitized links).

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | High | SSRF: worker fetches a client-supplied blob URL with no host validation | **Fixed** |
| 2 | High | Dev auth-bypass not guarded on the Vercel serverless entry path | **Fixed** |
| 3 | Medium | `.env` and `backend/.env` tracked in git; `.gitignore` didn't exclude them | **Partly fixed** (gitignore updated; untracking needs sign-off) |
| 4 | Medium | Stored XSS: user-controlled URLs rendered into `href` without sanitization | **Fixed** (primary surfaces) |
| 5 | Medium | No Content-Security-Policy; Vercel missing HSTS/COOP/Permissions-Policy | **Fixed** (headers added; CSP added in Report-Only mode) |
| 6 | Low | API returns raw internal error messages to clients on 5xx | **Fixed** |
| 7 | Low | `xlsx@0.18.5` has known prototype-pollution / ReDoS advisories | **Recommendation** |
| 8 | Info | Medical/health collections readable by any active org user | **Recommendation** |
| 9 | Info | `publicQrEnabled` records are world-readable (by design for QR) | **Noted** |

No SQL/NoSQL injection, `eval`, command injection (ffmpeg uses arg arrays, not a shell), or `dangerouslySetInnerHTML` XSS was found. The two `dangerouslySetInnerHTML` uses inject static, hardcoded CSS only.

---

## Findings & fixes

### 1. SSRF in Incident-AI media fetch — High — Fixed
`server/incident-ai/service.js#registerUploadedBlob` stores a client-supplied `body.url` as the evidence `blobUrl`. The worker later calls `server/incident-ai/blob-storage.js#ensureLocalFile`, which did `fetch(blobUrl)` with no validation. An authenticated org user could point evidence at an internal address (e.g. cloud metadata `http://169.254.169.254/…`, `http://localhost`, internal services); the server would fetch it, feed it to ffmpeg/OpenAI, and could surface the response in analysis output or error text.

**Fix:** added `assertFetchableBlobUrl()` in `blob-storage.js`. Before any fetch, the URL must be `https:` and its host must match an allowlist — by default any `*.blob.vercel-storage.com` host (covers public and private Vercel Blob), overridable via `INCIDENT_AI_ALLOWED_BLOB_HOSTS`. Legitimate upload flows already produce Vercel Blob URLs, so behavior is unchanged; internal/metadata targets are rejected.

### 2. Dev auth-bypass on the Vercel path — High — Fixed
`MockFirebaseAuthService` returns a default **`Global Owner` / `GLOBAL`-site** context and honors attacker-supplied `x-dev-auth-*` headers to impersonate any org/role — gated only by `ALLOW_DEV_AUTH_BYPASS`. The standalone server and Firebase Function call `validateBackendRuntimeConfig()` at boot, which refuses to start when that flag is true in production. The **Vercel serverless entry** (`api/v1.js` → `getIncidentAiRuntime`) never runs that validation, so the guard was absent on that deployment.

**Fix:** `server/incident-ai/runtime.js#resolveAuthContext` now treats the bypass as disabled whenever `NODE_ENV === 'production'`, regardless of the flag. This closes the gap on the Vercel path while leaving local development (`NODE_ENV` unset/`development`) working as before.
*Note:* the committed `backend/.env` currently has `ALLOW_DEV_AUTH_BYPASS=false` and empty secrets, so this was a latent gap, not an active breach.

### 3. Environment files committed to git — Medium — Partly fixed
`.env` and `backend/.env` were tracked, and `.gitignore` only excluded `.env*.local`. The committed values are currently placeholders (frontend `.env` holds the public Firebase web config; `backend/.env` secrets are empty), so nothing live leaked — but the setup invites a future accidental secret commit.

**Fixed:** `.gitignore` now excludes `.env`, `.env.*`, `backend/.env*`, and `**/.env*`, while keeping `.env.example` tracked.

**Needs your sign-off — run when ready** (removes the files from tracking but keeps them on disk; confirm your CI/Vercel/Firebase env vars are set in their dashboards first):
```bash
git rm --cached .env backend/.env
git commit -m "chore: stop tracking environment files"
```
If any real secret was ever committed in history, rotate it (Firebase service account, OpenAI key, webhook keys) and consider history scrubbing.

### 4. Stored XSS via unsanitized `href` — Medium — Fixed (primary surfaces)
Uploaded document/evidence URLs are rendered straight into `href={…}` (e.g. vendor/contractor docs, CAPA closure evidence). React does **not** sanitize hrefs, so a stored `javascript:` or `data:text/html` value would execute when a staff member clicks "View". In a multi-tenant app with an external vendor portal, that's a realistic stored-XSS path.

**Fix:** added `safeDocumentHref()` to `src/utils/security.js` (denylists `javascript:`/`vbscript:`/`file:` and script-capable `data:` types — html, xml, svg, js — while allowing http/https/blob/mailto/relative paths and legitimate `data:` files such as pdf, images, office docs, octet-stream). Wired into the user-document links in `VendorPortal.jsx`, `Capa.jsx`, `WorkerProfileModal.jsx`, and `CompanyProfileModal.jsx`. Logic unit-tested (17/17). UI behavior for valid files is unchanged.

*Remaining (optional):* the evidence links in `Audit.jsx` use the `download` attribute (the browser downloads rather than navigates, so script doesn't execute) — lower risk and left as-is to avoid breaking downloads of arbitrary file types. Wrap them with `safeDocumentHref` too if you want belt-and-suspenders.

### 5. Missing security headers / CSP — Medium — Partly fixed
Firebase hosting set a solid header set; `vercel.json` was missing several, and **neither** deployment set a Content-Security-Policy.

**Fixed:** added `Strict-Transport-Security`, `Cross-Origin-Opener-Policy`, and `Permissions-Policy` to `vercel.json` to match the Firebase config. Also added a **`Content-Security-Policy-Report-Only`** header to both `vercel.json` and both `firebase.json` hosting targets, tuned for the app's real dependencies (Font Awesome via cdnjs, Google Fonts, Firebase, EmailJS, Vercel Blob, plus `data:`/`blob:` images). Report-Only means it monitors and reports violations without blocking anything, so the UI is unaffected.

**Next step (yours):** watch for CSP violation reports in the browser console for a few days, adjust the allowlist if needed, then switch the header name from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` to enforce.

### 6. Internal error messages leaked to clients — Low — Fixed
`api/v1.js` returned `error.message` verbatim for all failures, including 5xx (which could echo internal URLs/state, e.g. the SSRF fetch error). **Fix:** 4xx still returns its actionable message; 5xx now returns a generic `"Incident AI request failed."` while the full error is still logged server-side.

### 7. `xlsx@0.18.5` — Low — Recommendation
The npm-published `xlsx` is unpatched for CVE-2023-30533 (prototype pollution) and a ReDoS advisory; fixes ship only via SheetJS's own CDN (≥0.20.x). If you parse user-supplied spreadsheets, migrate to the SheetJS CDN build. (Note: a live `npm audit` couldn't run here — the registry advisory endpoint is blocked by the sandbox network allowlist; this is from manual review.)

### 8. Health/medical data read scope — Info — Recommendation
`healthCases`, `healthSurveillance`, `vaccinationRecords`, and `illnessRecords` are readable by any **active** org user (site-scoped where applicable, but not role-restricted). Given the sensitivity, consider restricting reads to specific roles (e.g. Global Owner / health roles). This is a behavior change, so it's left for your decision.

### 9. `publicQrEnabled` exposure — Info — By design
Single `ptwRecords/$id`, `lotoProcedures/$id`, and `emergencyEquipment/$id` records are world-readable when `publicQrEnabled === true` (for field QR scanning). The full record is exposed, not a subset — keep public-facing fields minimal.

---

## What was verified
- **Sanitizer logic:** 17/17 unit assertions pass (blocks script URLs, preserves valid files/links).
- **Project test suite:** 45/45 pass (`permissions`, `user-access`, `contractor-incidents`, `incidents-utils`, `database-rules`, `field-qr`, `vendor-portal-email`) — none of the touched files affected this logic.
- **Frontend edits:** all new imports resolve to real files; all `safeDocumentHref(...)` calls are balanced; changes are surgical wraps.
- **Server edits:** reviewed complete and well-formed.
- **Not run:** full `vite build` — the sandbox lacks the Linux-native `rolldown` binary that `vite@8` requires (platform artifact, unrelated to these changes). Please run `npm run build` locally to confirm the production bundle.

## Files changed
- `server/incident-ai/blob-storage.js` — SSRF host allowlist
- `server/incident-ai/runtime.js` — production dev-bypass guard
- `api/v1.js` — generic 5xx error messages
- `src/utils/security.js` — `safeDocumentHref()` sanitizer
- `src/pages/VendorPortal.jsx`, `src/pages/Capa.jsx`, `src/pages/Contractors/components/WorkerProfileModal.jsx`, `src/pages/Contractors/components/CompanyProfileModal.jsx` — sanitized document links
- `vercel.json` — HSTS / COOP / Permissions-Policy / CSP (Report-Only)
- `firebase.json` — CSP (Report-Only) on both hosting targets
- `.gitignore` — exclude env files
