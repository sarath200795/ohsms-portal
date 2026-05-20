# Vercel Deployment Guide

This repo can be deployed to Vercel as two separate frontend projects:

- `Main App`
- `Field Portal`

The repo now also includes a first Vercel-native `Incident AI` path under [api/v1.js](C:/Users/Sarath/ohsms-enterprise/api/v1.js) and [server/incident-ai](C:/Users/Sarath/ohsms-enterprise/server/incident-ai). This is the recommended direction if you want to run the incident AI flow on Vercel instead of Render.

## Recommended Domains

- Main app: `app.yourdomain.com`
- Field portal: `field.yourdomain.com`

## Shared Environment Variables

Add these variables to both Vercel projects:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_APP_CHECK_SITE_KEY=
```

For the `Main App` project, add these server-side variables too so the `/api/v1` function can run:

```bash
BLOB_READ_WRITE_TOKEN=
FIREBASE_DATABASE_URL=
FIREBASE_SERVICE_ACCOUNT_JSON=
INCIDENT_AI_FIREBASE_ROOT=backend/incidentAi
ALLOW_DEV_AUTH_BYPASS=false
OPENAI_API_KEY=
INCIDENT_AI_WEBHOOK_URL=
```

## Project 1: Main App

Create a Vercel project from this repo with these settings:

- Root Directory: `.`
- Framework Preset: `Vite`
- Build Command: `npm run vercel:build:app`
- Output Directory: `dist`
- Install Command: `npm install`

Routing and headers are already defined in [vercel.json](C:/Users/Sarath/ohsms-enterprise/vercel.json).

## Project 2: Field Portal

Create a second Vercel project from the same repo with these settings:

- Root Directory: `.`
- Framework Preset: `Vite`
- Build Command: `npm run vercel:build:field-portal`
- Output Directory: `dist-field-portal`
- Install Command: `npm install`

The field portal uses the same SPA routing pattern as the main app. A reference config is included in [vercel.field-portal.json](C:/Users/Sarath/ohsms-enterprise/vercel.field-portal.json).

## Firebase Authentication Setup

After both Vercel projects are deployed, add every live Vercel domain to Firebase Authentication authorized domains:

- main app Vercel domain
- field portal Vercel domain
- main custom domain, if used
- field custom domain, if used

Without this step, login and password-reset flows can fail even if the frontend build is correct.

## Incident AI Backend

There are now two supported approaches:

- `Vercel-native`: leave `VITE_INCIDENT_AI_API_BASE_URL` empty and let the frontend use same-origin `/api/v1`
- `External API`: point `VITE_INCIDENT_AI_API_BASE_URL` at a Render or other hosted backend

The Vercel-native path already supports:
- Vercel Functions for incident AI endpoints
- Vercel Blob storage for uploaded media
- direct browser-to-Blob uploads for larger video files
- Firebase-backed durable job state when Firebase Admin credentials are configured

Current limitation:
- media extraction and provider orchestration still reuse the compiled backend artifacts under [backend/dist](C:/Users/Sarath/ohsms-enterprise/backend/dist), so the next hardening step is replacing those imports with fully source-owned Vercel server modules.

## Suggested Rollout Order

1. Deploy the main app project.
2. Deploy the field portal project.
3. Add both Vercel domains to Firebase Auth authorized domains.
4. Map custom subdomains if needed.
5. Retest login, QR routing, PTW deep links, and field portal navigation.

## Post-Deploy Checks

Main app:

- dashboard opens after login
- incidents module can upload photo and video evidence and call smart investigation
- `/api/v1/health/ready` returns ready on the main Vercel domain
- analytics, inspections, PTW, and LOTO routes open directly

Field portal:

- login works on the field domain
- QR routes open PTW / LOTO / emergency equipment correctly
- field home back-navigation stays inside field portal
- inspection and incident report-only flows still submit correctly

## Notes

- The repo-level [vercel.json](C:/Users/Sarath/ohsms-enterprise/vercel.json) is the active config for the main app.
- [vercel.field-portal.json](C:/Users/Sarath/ohsms-enterprise/vercel.field-portal.json) is included as a field-portal reference config for documentation and future separation.
- The field portal build is driven by [vite.field-portal.config.js](C:/Users/Sarath/ohsms-enterprise/vite.field-portal.config.js).
