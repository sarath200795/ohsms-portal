import { randomUUID } from 'node:crypto';

export class VercelIncidentAiWorkerService {
    constructor(stateStore, mediaService, providerService) {
        this.stateStore = stateStore;
        this.mediaService = mediaService;
        this.providerService = providerService;
        this.activeJobs = new Set();
        this.workerId = process.env.INCIDENT_AI_WORKER_ID || `vercel_${randomUUID().slice(0, 8)}`;
        this.leaseMs = Number(process.env.INCIDENT_AI_JOB_LEASE_MS || 5 * 60 * 1000);
    }

    getHealthSnapshot() {
        return {
            workerId: this.workerId,
            pollMs: 0,
            leaseMs: this.leaseMs,
            polling: false,
            activeJobs: this.activeJobs.size,
            mode: 'vercel-waitUntil'
        };
    }

    enqueue() {
        // Vercel migration path: work is triggered explicitly with waitUntil().
    }

    async runJob(incidentKey) {
        if (this.activeJobs.has(incidentKey)) {
            console.log('[IncidentAI] job already active, skipping duplicate run', { incidentKey, workerId: this.workerId });
            return;
        }

        this.activeJobs.add(incidentKey);
        const startedAt = Date.now();
        console.log('[IncidentAI] job started', { incidentKey, workerId: this.workerId });

        try {
            const claimedJob = await this.stateStore.claimAnalysisJob(incidentKey, this.workerId, this.leaseMs);
            if (!claimedJob) {
                console.log('[IncidentAI] job not claimable (already claimed or missing)', { incidentKey, workerId: this.workerId });
                return;
            }

            const evidence = await this.stateStore.getEvidenceRecord(incidentKey);
            if (!evidence) {
                console.error('[IncidentAI] no evidence record found for claimed job', { incidentKey, workerId: this.workerId });
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

            console.log('[IncidentAI] job completed', { incidentKey, workerId: this.workerId, durationMs: Date.now() - startedAt });
        } catch (error) {
            const durationMs = Date.now() - startedAt;
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
            console.error('[IncidentAI] job failed', { incidentKey, workerId: this.workerId, durationMs, stage: job?.stage, error: this.normalizeError(error) });
        } finally {
            this.activeJobs.delete(incidentKey);
        }
    }

    async updateJob(incidentKey, existingJob, patch) {
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

    async requireJob(incidentKey) {
        const job = await this.stateStore.getAnalysisJob(incidentKey);
        if (!job) {
            throw new Error(`Analysis job ${incidentKey} was not found during worker execution.`);
        }
        return job;
    }

    normalizeError(error) {
        if (error instanceof Error) return error.message;
        return String(error || 'Unknown error');
    }
}
