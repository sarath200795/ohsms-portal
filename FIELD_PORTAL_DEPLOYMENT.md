# Field Portal Deployment

This repo now supports a separate standalone build for the field portal.

## Local build commands

```bash
npm run build
npm run build:field-portal
```

Main app output:

```text
dist/
```

Field portal output:

```text
dist-field-portal/
```

## Firebase hosting setup

The main app is already mapped to the `app` hosting target.

The field portal needs its own Firebase Hosting site so it can be attached to a subdomain.

### 1. Log in to Firebase CLI

```bash
firebase login
```

### 2. Create a dedicated hosting site for the field portal

Pick a site id that matches the desired subdomain, for example:

```bash
firebase hosting:sites:create your-field-portal-site-id --project ohsms-3894f
```

Example:

```bash
firebase hosting:sites:create field-portal-ohsms --project ohsms-3894f
```

### 3. Map the new hosting site to the `fieldportal` target

```bash
firebase target:apply hosting fieldportal your-field-portal-site-id --project ohsms-3894f
```

Example:

```bash
firebase target:apply hosting fieldportal field-portal-ohsms --project ohsms-3894f
```

### 4. Deploy the field portal

```bash
npm run firebase:deploy:field-portal
```

## Subdomain mapping

After the hosting site is deployed:

1. Open Firebase Console
2. Go to Hosting
3. Select the field portal site
4. Add a custom domain or subdomain

Example custom subdomain:

```text
field.yourdomain.com
```

## Entry points

Main enterprise app:

```text
src/App.jsx
index.html
vite.config.js
```

Standalone field portal app:

```text
src/FieldPortalApp.jsx
src/fieldPortalMain.jsx
field-portal-app/index.html
vite.field-portal.config.js
```
