# Incidents AI Backend

This folder contains the isolated backend scaffold for the `Incidents AI` feature set described in:

- [incident-ai-video-investigation-spec.md](C:/Users/Sarath/ohsms-enterprise/docs/incident-ai-video-investigation-spec.md)
- [incident-ai-video-investigation-openapi.yaml](C:/Users/Sarath/ohsms-enterprise/docs/incident-ai-video-investigation-openapi.yaml)

## What This Service Includes

- NestJS-based backend entrypoint
- Health endpoints
- Firebase ID token verification with org/user resolution through Firebase Admin
- Explicit dev auth bypass for local-only testing
- Incident AI upload-session, evidence-confirmation, analysis-start, status, result, and retry endpoints
- Real local evidence upload endpoint for photo/video bytes
- Local runtime storage under `.runtime/storage`
- Real media preparation flow that attempts FFmpeg-based audio and frame extraction
- Multi-provider analysis orchestration across `local`, `openai`, and optional `webhook` sources
- Persistent job/result state with local JSON storage or Firebase Realtime Database via Firebase Admin
- In-process worker with poll/lease execution and restart-safe job recovery
- Smoke test for the full upload -> confirm -> analyze -> result flow

## What This Service Does Not Yet Include

- Real storage signed URLs
- Managed background queue infrastructure such as Cloud Tasks or Pub/Sub
- Guaranteed OpenAI/webhook availability in local development without credentials

## Local Use

```bash
cd backend
npm install
npm run dev
npm run test:smoke
```

The server starts on `http://localhost:4010` by default and exposes routes under:

```txt
/api/v1
```

## Local Auth Behavior

For development, the backend allows a bypass context only when:

```txt
ALLOW_DEV_AUTH_BYPASS=true
```

In deployment, keep:

```txt
ALLOW_DEV_AUTH_BYPASS=false
```

The normal production flow is:

1. frontend signs the user in with Firebase Auth
2. frontend sends the Firebase ID token as `Authorization: Bearer <token>`
3. backend verifies the token with Firebase Admin
4. backend resolves `orgId`, role, and site access from your Realtime Database user records

## Runtime Storage

Uploaded incident evidence is now persisted locally by default under:

```txt
backend/.runtime/storage
```

You can override the runtime directory with:

```txt
INCIDENT_AI_RUNTIME_DIR=.runtime
```

## State Persistence

Incident AI state can now run in either local or Firebase-backed mode:

```txt
INCIDENT_AI_STATE_PROVIDER=auto
```

Supported values:

- `local`: store state in `backend/.runtime/state/incident-ai-state.json`
- `firebase`: require Firebase Admin credentials and write state to Realtime Database
- `auto`: use Firebase when credentials and database URL are available, otherwise fall back to local JSON

When Firebase-backed persistence is enabled, configure:

```txt
FIREBASE_DATABASE_URL=
INCIDENT_AI_FIREBASE_ROOT=backend/incidentAi
FIREBASE_SERVICE_ACCOUNT_JSON=
```

Or supply the split credential fields:

```txt
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

The worker polling and job lease behavior can be tuned with:

```txt
INCIDENT_AI_JOB_POLL_MS=10000
INCIDENT_AI_JOB_LEASE_MS=300000
INCIDENT_AI_WORKER_ID=
```

## Deployment

### Container Build

```bash
cd backend
docker build -t ohsms-incident-ai .
docker run --rm -p 4010:4010 --env-file .env ohsms-incident-ai
```

### Cloud Run Style Deployment

This service is designed to run well on Cloud Run or any similar container platform.

Recommended runtime expectations:

- `NODE_ENV=production`
- `ALLOW_DEV_AUTH_BYPASS=false`
- `FIREBASE_DATABASE_URL` set
- Firebase Admin credentials available through:
  - attached service account / application default credentials, or
  - `FIREBASE_SERVICE_ACCOUNT_JSON`, or
  - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`
- `INCIDENT_AI_CORS_ORIGINS` set to your web app domains

Example Cloud Run deploy command:

```bash
gcloud run deploy ohsms-incident-ai \
  --source ./backend \
  --region <your-region> \
  --platform managed \
  --allow-unauthenticated
```

Important:

- `allow-unauthenticated` is correct here because browser clients call the service directly and the app enforces Firebase Auth inside the service layer.
- Protect the service with Firebase ID tokens, not Cloud Run IAM browser gating.
- For production durability, prefer `INCIDENT_AI_STATE_PROVIDER=firebase`.

## Firebase Functions Deployment

This repository is also wired so the backend can be deployed directly with the existing Firebase CLI session as a 2nd gen HTTP function.

Function entrypoint:

```txt
incidentAiApi
```

Expected base URL after deployment:

```txt
https://asia-south1-ohsms-3894f.cloudfunctions.net/incidentAiApi/api/v1
```

Deploy command:

```bash
firebase deploy --only functions:incidentAiApi
```

Local emulator command:

```bash
cd backend
npm run serve:functions
```

## Render Deployment

If you want to avoid the Firebase Blaze dependency for backend hosting, this repo now includes a Render blueprint at:

```txt
render.yaml
```

Recommended flow:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Use the generated service from `render.yaml`.
4. Add the secret env vars:
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - or `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `OPENAI_API_KEY` if OpenAI analysis is required
   - `INCIDENT_AI_WEBHOOK_URL` and `INCIDENT_AI_WEBHOOK_API_KEY` if using webhook providers
5. After Render gives you the live backend URL, point the frontend to it:

```bash
node scripts/backend/set-incident-ai-url.mjs https://<your-render-service>/api/v1
```

Then redeploy the web app:

```bash
npm run firebase:deploy
```

Render is a good fit here because it can run the existing Dockerized NestJS backend without requiring the Firebase project itself to be on Blaze for backend hosting.

## Provider Order

The backend now supports multiple analysis sources in one run:

- `local`: always available, based on stored evidence metadata and extracted media context
- `openai`: enabled when `OPENAI_API_KEY` is configured
- `webhook`: enabled when `INCIDENT_AI_WEBHOOK_URL` is configured

Provider precedence is controlled by:

```txt
INCIDENT_AI_PROVIDER_ORDER=webhook,openai,local
```

The service merges available outputs in that order while always keeping the local provider as a fallback.
