import { createRequire } from 'node:module';
import { VercelBlobIncidentAiStorageService } from './blob-storage.js';
import { VercelIncidentAiMediaService } from './media-service.js';
import { VercelIncidentAiService } from './service.js';
import { VercelIncidentAiWorkerService } from './worker-service.js';

const require = createRequire(import.meta.url);

const authModule = require('../../backend/dist/modules/auth/firebase-identity.service.js');
const mockAuthModule = require('../../backend/dist/modules/auth/mock-firebase-auth.service.js');
const stateStoreModule = require('../../backend/dist/modules/incidents/incident-ai-state-store.service.js');
const providerModule = require('../../backend/dist/modules/incidents/incident-ai-provider.service.js');

const { FirebaseIdentityService } = authModule;
const { MockFirebaseAuthService } = mockAuthModule;
const { IncidentAiStateStoreService } = stateStoreModule;
const { IncidentAiProviderService } = providerModule;

let runtimePromise = null;

const headersToObject = (request) => {
    const output = {};
    request.headers.forEach((value, key) => {
        output[key.toLowerCase()] = value;
    });
    return output;
};

// The standalone backend and Firebase Function entry points call
// validateBackendRuntimeConfig() at boot, which refuses to start when
// ALLOW_DEV_AUTH_BYPASS is true in production. The Vercel serverless entry
// (api/v1.js -> getIncidentAiRuntime) does NOT run that validation, so we must
// independently refuse the bypass in production here. Otherwise the mock auth
// service would hand any unauthenticated caller a "Global Owner" context (and
// honor attacker-controlled x-dev-auth-* headers to impersonate any org).
const isProductionRuntime = () => String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const resolveAuthContext = async (request, authService, mockAuthService) => {
    const headers = headersToObject(request);
    const token = authService.extractBearerToken(headers);
    const devBypassAllowed = authService.isDevBypassEnabled() && !isProductionRuntime();

    if (token) {
        if (!authService.isFirebaseAuthConfigured() && devBypassAllowed) {
            return mockAuthService.resolveAuthContext(headers);
        }
        return authService.resolveVerifiedAuthContext(headers);
    }

    if (devBypassAllowed) {
        return mockAuthService.resolveAuthContext(headers);
    }

    throw Object.assign(new Error('Missing bearer token.'), { statusCode: 401 });
};

export const getIncidentAiRuntime = async () => {
    if (!runtimePromise) {
        runtimePromise = (async () => {
            const authService = new FirebaseIdentityService();
            const mockAuthService = new MockFirebaseAuthService();
            const stateStore = new IncidentAiStateStoreService();
            await stateStore.onModuleInit();

            const storageService = new VercelBlobIncidentAiStorageService();
            const mediaService = new VercelIncidentAiMediaService(storageService);
            const providerService = new IncidentAiProviderService();
            const workerService = new VercelIncidentAiWorkerService(stateStore, mediaService, providerService);
            const incidentService = new VercelIncidentAiService(storageService, stateStore);

            return {
                authService,
                mockAuthService,
                stateStore,
                storageService,
                mediaService,
                providerService,
                workerService,
                incidentService
            };
        })();
    }

    return runtimePromise;
};

export { headersToObject, resolveAuthContext };
