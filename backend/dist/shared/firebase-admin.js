"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrInitializeFirebaseAdminApp = exports.canUseFirebaseDatabase = exports.hasFirebaseAdminCredentials = exports.hasGoogleApplicationCredentials = exports.hasSplitFirebaseCredentials = exports.hasInlineServiceAccountJson = exports.isGoogleManagedRuntime = exports.getFirebaseDatabaseUrl = void 0;
const app_1 = require("firebase-admin/app");
const readEnv = (key) => String(process.env[key] || '').trim();
const getFirebaseDatabaseUrl = () => readEnv('FIREBASE_DATABASE_URL') || readEnv('VITE_FIREBASE_DATABASE_URL');
exports.getFirebaseDatabaseUrl = getFirebaseDatabaseUrl;
const isGoogleManagedRuntime = () => Boolean(readEnv('K_SERVICE')
    || readEnv('FUNCTION_TARGET')
    || readEnv('GAE_ENV')
    || readEnv('GOOGLE_CLOUD_PROJECT'));
exports.isGoogleManagedRuntime = isGoogleManagedRuntime;
const hasInlineServiceAccountJson = () => Boolean(readEnv('FIREBASE_SERVICE_ACCOUNT_JSON'));
exports.hasInlineServiceAccountJson = hasInlineServiceAccountJson;
const hasSplitFirebaseCredentials = () => Boolean(readEnv('FIREBASE_PROJECT_ID')
    && readEnv('FIREBASE_CLIENT_EMAIL')
    && readEnv('FIREBASE_PRIVATE_KEY'));
exports.hasSplitFirebaseCredentials = hasSplitFirebaseCredentials;
const hasGoogleApplicationCredentials = () => Boolean(readEnv('GOOGLE_APPLICATION_CREDENTIALS'));
exports.hasGoogleApplicationCredentials = hasGoogleApplicationCredentials;
const hasFirebaseAdminCredentials = () => ((0, exports.hasInlineServiceAccountJson)()
    || (0, exports.hasSplitFirebaseCredentials)()
    || (0, exports.hasGoogleApplicationCredentials)()
    || (0, exports.isGoogleManagedRuntime)());
exports.hasFirebaseAdminCredentials = hasFirebaseAdminCredentials;
const canUseFirebaseDatabase = () => Boolean((0, exports.getFirebaseDatabaseUrl)() && (0, exports.hasFirebaseAdminCredentials)());
exports.canUseFirebaseDatabase = canUseFirebaseDatabase;
const buildFirebaseCredential = () => {
    if ((0, exports.hasInlineServiceAccountJson)()) {
        return (0, app_1.cert)(JSON.parse(readEnv('FIREBASE_SERVICE_ACCOUNT_JSON')));
    }
    if ((0, exports.hasSplitFirebaseCredentials)()) {
        return (0, app_1.cert)({
            projectId: readEnv('FIREBASE_PROJECT_ID'),
            clientEmail: readEnv('FIREBASE_CLIENT_EMAIL'),
            privateKey: readEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')
        });
    }
    return (0, app_1.applicationDefault)();
};
const getOrInitializeFirebaseAdminApp = () => {
    if ((0, app_1.getApps)().length > 0) {
        return (0, app_1.getApp)();
    }
    const options = {
        credential: buildFirebaseCredential()
    };
    const databaseURL = (0, exports.getFirebaseDatabaseUrl)();
    if (databaseURL) {
        options.databaseURL = databaseURL;
    }
    return (0, app_1.initializeApp)(options);
};
exports.getOrInitializeFirebaseAdminApp = getOrInitializeFirebaseAdminApp;
