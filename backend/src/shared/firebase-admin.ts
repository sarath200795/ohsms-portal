import { applicationDefault, cert, getApp, getApps, initializeApp, type App, type AppOptions } from 'firebase-admin/app';

const readEnv = (key: string) => String(process.env[key] || '').trim();

export const getFirebaseDatabaseUrl = () => readEnv('FIREBASE_DATABASE_URL') || readEnv('VITE_FIREBASE_DATABASE_URL');

export const isGoogleManagedRuntime = () => Boolean(
    readEnv('K_SERVICE')
    || readEnv('FUNCTION_TARGET')
    || readEnv('GAE_ENV')
    || readEnv('GOOGLE_CLOUD_PROJECT')
);

export const hasInlineServiceAccountJson = () => Boolean(readEnv('FIREBASE_SERVICE_ACCOUNT_JSON'));

export const hasSplitFirebaseCredentials = () => Boolean(
    readEnv('FIREBASE_PROJECT_ID')
    && readEnv('FIREBASE_CLIENT_EMAIL')
    && readEnv('FIREBASE_PRIVATE_KEY')
);

export const hasGoogleApplicationCredentials = () => Boolean(readEnv('GOOGLE_APPLICATION_CREDENTIALS'));

export const hasFirebaseAdminCredentials = () => (
    hasInlineServiceAccountJson()
    || hasSplitFirebaseCredentials()
    || hasGoogleApplicationCredentials()
    || isGoogleManagedRuntime()
);

export const canUseFirebaseDatabase = () => Boolean(getFirebaseDatabaseUrl() && hasFirebaseAdminCredentials());

const buildFirebaseCredential = () => {
    if (hasInlineServiceAccountJson()) {
        return cert(JSON.parse(readEnv('FIREBASE_SERVICE_ACCOUNT_JSON')));
    }

    if (hasSplitFirebaseCredentials()) {
        return cert({
            projectId: readEnv('FIREBASE_PROJECT_ID'),
            clientEmail: readEnv('FIREBASE_CLIENT_EMAIL'),
            privateKey: readEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')
        });
    }

    return applicationDefault();
};

export const getOrInitializeFirebaseAdminApp = (): App => {
    if (getApps().length > 0) {
        return getApp();
    }

    const options: AppOptions = {
        credential: buildFirebaseCredential()
    };

    const databaseURL = getFirebaseDatabaseUrl();
    if (databaseURL) {
        options.databaseURL = databaseURL;
    }

    return initializeApp(options);
};
