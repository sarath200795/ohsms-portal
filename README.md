# OHSMS Enterprise

WE EHS Safety Tool is a multi-module EHS platform built on React, Vite, and Firebase. The repo contains:

- Main enterprise app
- Standalone field portal
- Vendor portal
- Module tutorial/video automation scripts

## Core Commands

```bash
npm install
npm run dev
npm run build
npm run build:field-portal
npm run test:platform
npm run lint:full
```

## Environment

Copy `.env.example` to `.env` and provide the Firebase values for the target environment.

Optional production hardening:

- `VITE_FIREBASE_APP_CHECK_SITE_KEY` enables Firebase App Check initialization in the browser

If environment variables are not present, the app falls back to the current Firebase project configuration embedded in the repo.

## Deploy

Main app:

```bash
npm run build
npm run firebase:deploy
```

Field portal:

```bash
npm run build:field-portal
npm run firebase:deploy:field-portal
```

More detail is available in `FIELD_PORTAL_DEPLOYMENT.md`.

Vercel deployment notes for the main app plus field portal are available in `VERCEL_DEPLOYMENT.md`.

## Current Security Posture

- Three-role RBAC model: `Global Owner`, `Site Owner`, `User`
- Realtime Database rules enforced and covered by platform tests
- Forced password change supported for newly provisioned internal users and vendor portal users
- Firebase Hosting security headers configured in `firebase.json`
- Optional App Check bootstrap available through env configuration

## Known Follow-Up Work

- Migrate attachment storage from Realtime Database base64 payloads to Firebase Storage with scoped rules
- Replace or isolate remaining `xlsx` import/export flows because the upstream package still has unresolved advisories
- Move privileged user provisioning from client-side flows to a backend/Admin SDK path for stricter enterprise control
