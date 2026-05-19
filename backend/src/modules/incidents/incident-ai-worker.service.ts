import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IncidentAiMediaService } from './incident-ai-media.service';
import { IncidentAiProviderService } from './incident-ai-provider.service';
import { IncidentAiStateStoreService } from './incident-ai-state-store.service';
import type { AnalysisJobRecord } from './incident-ai.types';

@Injectable()
export class IncidentAiWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly activeJobs = new Set<string>();
    private readonly workerId = process.env.INCIDENT_AI_WORKER_ID || `worker_${randomUUID().slice(0, 8)}`;
    private readonly leaseMs = Number(process.env.INCIDENT_AI_JOB_LEASE_MS || 5 * 60 * 1000);
    private readonly pollMs = Number(process.env.INCIDENT_AI_JOB_POLL_MS || 10_000);
    private pollTimer: NodeJS.Timeout | null = null;

    constructor(
        private readonly stateStore: IncidentAiStateStoreService,
        private readonly mediaService: IncidentAiMediaService,
        private readonly providerService: IncidentAiProviderService
    ) {}

    async onApplicationBootstrap() {
        await this.pollForJobs();
        this.pollTimer = setInterval(() => {
            void this.pollForJobs();
        }, this.pollMs);
    }

    onApplicationShutdown() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    getHealthSnapshot() {
        return {
            workerId: this.workerId,
            pollMs: this.pollMs,
            leaseMs: this.leaseMs,
            polling: Boolean(this.pollTimer),
            activeJobs: this.activeJobs.size
        };
    }

    enqueue(incidentKey: string) {
        if (this.activeJobs.has(incidentKey)) return;

        this.activeJobs.add(incidentKey);
        setTimeout(() => {
            void this.runJob(incidentKey);
        }, 0);
    }

    private async runJob(incidentKey: string) {
        try {
            const claimedJob = await this.stateStore.claimAnalysisJob(incidentKey, this.workerId, this.leaseMs);
            if (!claimedJob) {
                this.activeJobs.delete(incidentKey);
                return;
            }

            const evidence = await this.stateStore.getEvidenceRecord(incidentKey);
            if (!evidence) {
                this.activeJobs.delete(incidentKey);
                return;
            }

            await this.updateJob(incidentKey, claimedJob, {
                status: 'processing',
                stage: 'validating-evidence',
                progressPercent: 10,
                failureMessage: undefined
            });

            await this.updateJob(incidentKey, await this.requireJob(incidentKey), {
                stage: 'extracting-media',
                progressPercent: 35
            });
            const mediaContext = await this.mediaService.prepareMediaContext(evidence, {
                frameSampleSeconds: claimedJob.request.frameSampleSeconds,
                maxFrames: claimedJob.request.maxFrames,
                includeAudioTranscript: claimedJob.request.includeAudioTranscript,
                includeVideo: claimedJob.request.includeVideo
            });

            await this.updateJob(incidentKey, await this.requireJob(incidentKey), {
                stage: 'running-provider-analysis',
                progressPercent: 72
            });
            const result = await this.providerService.analyze({
                incidentId: evidence.incidentId,
                evidence,
                mediaContext,
                request: claimedJob.request
            });

            await this.stateStore.setAnalysisResult(incidentKey, result);
            await this.updateJob(incidentKey, await this.requireJob(incidentKey), {
                status: 'completed',
                stage: 'completed',
                progressPercent: 100,
                completedAt: new Date().toISOString(),
                failureMessage: undefined,
                leaseExpiresAt: undefined
            });
        } catch (error) {
            const job = await this.stateStore.getAnalysisJob(incidentKey);
            if (job) {
                await this.updateJob(incidentKey, job, {
                    status: 'failed',
                    stage: 'failed',
                    failureMessage: this.normalizeError(error),
                    leaseExpiresAt: undefined
                });
                await this.stateStore.deleteAnalysisResult(incidentKey);
            }
            console.error('Incident AI analysis job failed:', error);
        } finally {
            this.activeJobs.delete(incidentKey);
        }
    }

    private async pollForJobs() {
        const pendingJobs = await this.stateStore.listPendingJobs();
        pendingJobs.forEach(({ incidentKey }) => this.enqueue(incidentKey));
    }

    private async updateJob(
        incidentKey: string,
        existingJob: AnalysisJobRecord,
        patch: Partial<AnalysisJobRecord>
    ) {
        await this.stateStore.setAnalysisJob(incidentKey, {
            ...existingJob,
            ...patch,
            workerId: this.workerId,
            leaseExpiresAt: patch.status === 'completed' || patch.status === 'failed'
                ? undefined
                : new Date(Date.now() + this.leaseMs).toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    private async requireJob(incidentKey: string) {
        const job = await this.stateStore.getAnalysisJob(incidentKey);
        if (!job) {
            throw new Error(`Analysis job ${incidentKey} was not found during worker execution.`);
        }
        return job;
    }

    private normalizeError(error: unknown) {
        if (error instanceof Error) return error.message;
        return String(error || 'Unknown error');
    }
}
