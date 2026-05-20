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

const resolveAuthContext = async (request, authService, mockAuthService) => {
    const headers = headersToObject(request);
    const token = authService.extractBearerToken(headers);

    if (token) {
        return authService.resolveVerifiedAuthContext(headers);
    }

    if (authService.isDevBypassEnabled()) {
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
