# Vercel Deployment Guide

This repo can be deployed to Vercel as two separate frontend projects:

- `Main App`
- `Field Portal`

The `Incident AI` backend should stay on Render because it depends on server-side media processing and longer-running analysis flows.

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
VITE_INCIDENT_AI_API_BASE_URL=https://ohsms-incident-ai-api.onrender.com/api/v1
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

Keep the frontend pointed to the Render backend:

```bash
VITE_INCIDENT_AI_API_BASE_URL=https://ohsms-incident-ai-api.onrender.com/api/v1
```

Do not move the current backend to Vercel unless the media-processing pipeline is redesigned for that runtime.

## Suggested Rollout Order

1. Deploy the main app project.
2. Deploy the field portal project.
3. Add both Vercel domains to Firebase Auth authorized domains.
4. Map custom subdomains if needed.
5. Retest login, QR routing, PTW deep links, and field portal navigation.

## Post-Deploy Checks

Main app:

- dashboard opens after login
- incidents module can upload media and call smart investigation
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
