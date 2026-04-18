# MP4 Video Export

This project now includes a browser-based video export pipeline.

## What it does

- records browser walkthroughs using Playwright
- saves raw browser video
- converts the result into `.mp4`
- can create one-minute module tours with female Windows narration

## Output location

- `artifacts/videos/`
- `artifacts/videos/minute-tours/` for the one-minute module walkthrough set

## Available commands

### 1. Record a public sample video

This does not require a login and is useful to validate the export pipeline.

```powershell
$env:VIDEO_BASE_URL="http://127.0.0.1:4173"
$env:VIDEO_SCENARIO="public-login-overview"
npm run video:record:public
```

### 2. Record an authenticated guided module video

This requires a working demo login.

```powershell
$env:VIDEO_BASE_URL="http://127.0.0.1:4173"
$env:VIDEO_EMAIL="demo@company.com"
$env:VIDEO_PASSWORD="your-password"
$env:VIDEO_SCENARIO="risk-module"
npm run video:record:guided
```

### 3. Record one-minute videos for every guided module

This renders the authenticated module set with female narration, natural screen movement, and a target duration of about one minute per module.

```powershell
$env:VIDEO_BASE_URL="http://127.0.0.1:4173"
$env:VIDEO_EMAIL="demo@company.com"
$env:VIDEO_PASSWORD="your-password"
npm run video:record:minute-modules
```

### 4. Record longer tutorial-style videos for every guided module

This renders a more presentable step-by-step tutorial set using a LOTO-style intro card, slower guided chapter cards, natural screen movement, and a neural female voice through Edge TTS when available.

```powershell
$env:VIDEO_BASE_URL="http://127.0.0.1:4173"
$env:VIDEO_EMAIL="demo@company.com"
$env:VIDEO_PASSWORD="your-password"
npm run video:record:tutorial-modules
```

Output:

- `artifacts/videos/tutorial-walkthroughs/`

Defaults for tutorial mode:

- record about `60 seconds` of live screen interaction per module
- export a `5 minute` narrated tutorial per module

## Current guided scenarios

- `dashboard-overview`
- `users-module`
- `sites-module`
- `analytics-module`
- `risk-module`
- `incidents-module`
- `consultation-module`
- `audit-module`
- `capa-module`
- `training-module`
- `improvement-module`
- `contractors-module`
- `ohs-tools-hub`
- `inspections-module`
- `ptw-module`
- `loto-module`
- `health-module`
- `standards-module`
- `emergency-module`
- `emergency-equipment-module`
- `field-app-overview`
- `field-portal-overview`
- `vendor-portal-overview`

## Current public sample scenarios

- `public-login-overview`
- `public-field-portal-overview`

## Important limitation

The authenticated module videos still require:

- a valid demo account
- seeded module data worth showing in a walkthrough

Without those, the recorder can export public portal and login samples, but it cannot produce honest feature walkthroughs for the protected modules.
