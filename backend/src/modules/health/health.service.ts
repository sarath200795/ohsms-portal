import { Injectable } from '@nestjs/common';
import { FirebaseIdentityService } from '../auth/firebase-identity.service';
import { IncidentAiMediaService } from '../incidents/incident-ai-media.service';
import { IncidentAiStateStoreService } from '../incidents/incident-ai-state-store.service';
import { IncidentAiWorkerService } from '../incidents/incident-ai-worker.service';

@Injectable()
export class HealthService {
    constructor(
        private readonly authService: FirebaseIdentityService,
        private readonly stateStore: IncidentAiStateStoreService,
        private readonly workerService: IncidentAiWorkerService,
        private readonly mediaService: IncidentAiMediaService
    ) {}

    getHealth() {
        return {
            status: 'ok',
            service: 'incident-ai-backend',
            timestamp: new Date().toISOString(),
            checks: {
                auth: this.authService.getHealthSnapshot(),
                state: this.stateStore.getHealthSnapshot(),
                worker: this.workerService.getHealthSnapshot(),
                media: this.mediaService.getHealthSnapshot()
            }
        };
    }

    getReadiness() {
        const auth = this.authService.getHealthSnapshot();
        const state = this.stateStore.getHealthSnapshot();
        const worker = this.workerService.getHealthSnapshot();
        const media = this.mediaService.getHealthSnapshot();
        const issues: string[] = [];

        if (!auth.firebaseAdminConfigured && !auth.devAuthBypassEnabled) {
            issues.push('Firebase Admin authentication is not configured.');
        }
        if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production' && auth.devAuthBypassEnabled) {
            issues.push('Developer auth bypass is still enabled in production.');
        }
        if (state.providerMode === 'firebase' && !state.firebaseDatabaseConfigured) {
            issues.push('Firebase-backed state mode is enabled, but the Realtime Database client is not ready.');
        }
        if (!worker.polling) {
            issues.push('Incident AI worker polling is not active.');
        }
        if (!media.ffmpegAvailable) {
            issues.push('FFmpeg is unavailable; video frame/audio extraction will be skipped.');
        }

        return {
            status: issues.length === 0 ? 'ready' : 'degraded',
            timestamp: new Date().toISOString(),
            checks: {
                auth,
                state,
                worker,
                media
            },
            ...(issues.length > 0 ? { issues } : {})
        };
    }
}
