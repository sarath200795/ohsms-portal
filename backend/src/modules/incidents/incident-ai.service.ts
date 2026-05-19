import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthContext } from '../../shared/types/auth-context';
import { IncidentAiStateStoreService } from './incident-ai-state-store.service';
import { IncidentAiStorageService } from './incident-ai-storage.service';
import { IncidentAiWorkerService } from './incident-ai-worker.service';
import { ConfirmEvidenceDto } from './dto/confirm-evidence.dto';
import { CreateUploadSessionDto } from './dto/create-upload-session.dto';
import { RequestAnalysisDto } from './dto/request-analysis.dto';
import { RetryAnalysisDto } from './dto/retry-analysis.dto';
import type {
    AnalysisJobRecord,
    IncidentEvidenceRecord,
    UploadSessionRecord
} from './incident-ai.types';

@Injectable()
export class IncidentAiService {
    constructor(
        private readonly storageService: IncidentAiStorageService,
        private readonly stateStore: IncidentAiStateStoreService,
        private readonly workerService: IncidentAiWorkerService
    ) {}

    async createUploadSession(incidentId: string, body: CreateUploadSessionDto, authContext: AuthContext) {
        this.ensureAccess(incidentId, authContext);
        if (!body.photo && !body.video) {
            throw new BadRequestException('At least one media file descriptor is required to create an upload session.');
        }

        const uploadSessionId = this.buildId('upl');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
        const session: UploadSessionRecord = {
            uploadSessionId,
            incidentId,
            orgId: authContext.orgId,
            createdBy: authContext.uid,
            createdAt: now.toISOString(),
            expiresAt,
            photo: body.photo
                ? this.buildUploadTarget(authContext.orgId, incidentId, uploadSessionId, 'photo', body.photo.fileName, body.photo.mimeType)
                : undefined,
            video: body.video
                ? this.buildUploadTarget(authContext.orgId, incidentId, uploadSessionId, 'video', body.video.fileName, body.video.mimeType)
                : undefined,
            uploadedFiles: {}
        };

        await this.stateStore.setUploadSession(uploadSessionId, session);

        return {
            incidentId,
            uploadSessionId,
            photo: session.photo,
            video: session.video,
            expiresAt
        };
    }

    async uploadEvidenceFile(
        incidentId: string,
        uploadSessionId: string,
        kind: string,
        file: {
            originalname?: string;
            mimetype?: string;
            size?: number;
            buffer?: Buffer;
        } | undefined,
        authContext: AuthContext
    ) {
        this.ensureAccess(incidentId, authContext);
        const normalizedKind = this.normalizeUploadKind(kind);
        const session = await this.requireUploadSession(uploadSessionId, incidentId, authContext.orgId);
        const uploadTarget = normalizedKind === 'photo' ? session.photo : session.video;

        if (!uploadTarget) {
            throw new NotFoundException(`No ${normalizedKind} upload target was created for this incident.`);
        }
        if (!file?.buffer || !file?.size) {
            throw new BadRequestException('Uploaded file payload is required.');
        }

        const uploadedRecord = await this.storageService.saveUploadedFile({
            storagePath: uploadTarget.storagePath,
            kind: normalizedKind,
            fileName: file.originalname || `${normalizedKind}-upload`,
            mimeType: file.mimetype || uploadTarget.headers['Content-Type'] || 'application/octet-stream',
            buffer: file.buffer,
            sizeBytes: file.size
        });

        session.uploadedFiles[normalizedKind] = uploadedRecord;
        await this.stateStore.setUploadSession(uploadSessionId, session);

        return {
            incidentId,
            uploadSessionId,
            kind: normalizedKind,
            storagePath: uploadedRecord.storagePath,
            sizeBytes: uploadedRecord.sizeBytes,
            uploadedAt: uploadedRecord.uploadedAt
        };
    }

    async confirmEvidence(incidentId: string, body: ConfirmEvidenceDto, authContext: AuthContext) {
        this.ensureAccess(incidentId, authContext);

        const uploadSession = await this.requireUploadSession(body.uploadSessionId, incidentId, authContext.orgId);
        if (!body.photo && !body.video) {
            throw new BadRequestException('At least one confirmed media file is required before evidence can be saved.');
        }

        const uploadedPhoto = body.photo ? this.requireUploadedFile(uploadSession, 'photo') : undefined;
        const uploadedVideo = body.video ? this.requireUploadedFile(uploadSession, 'video') : undefined;

        if (body.photo && !(await this.storageService.fileExists(body.photo.storagePath))) {
            throw new ConflictException('Photo upload is not available in backend storage yet.');
        }
        if (body.video && !(await this.storageService.fileExists(body.video.storagePath))) {
            throw new ConflictException('Video upload is not available in backend storage yet.');
        }

        const record: IncidentEvidenceRecord = {
            incidentId,
            orgId: authContext.orgId,
            photo: body.photo,
            video: body.video,
            notes: body.notes?.trim() || '',
            confirmedAt: new Date().toISOString(),
            uploaded: {
                photo: uploadedPhoto,
                ...(uploadedVideo ? { video: uploadedVideo } : {})
            }
        };

        await this.stateStore.setEvidenceRecord(this.incidentKey(authContext.orgId, incidentId), record);

        return {
            incidentId,
            evidenceStatus: 'confirmed',
            photoAttached: Boolean(body.photo),
            videoAttached: Boolean(body.video),
            storedEvidence: {
                ...(uploadedPhoto
                    ? {
                        photo: {
                            sizeBytes: uploadedPhoto.sizeBytes,
                            sha256: uploadedPhoto.sha256
                        }
                    }
                    : {}),
                ...(uploadedVideo
                    ? {
                        video: {
                            sizeBytes: uploadedVideo.sizeBytes,
                            sha256: uploadedVideo.sha256
                        }
                    }
                    : {})
            }
        };
    }

    async startAnalysis(incidentId: string, body: RequestAnalysisDto, authContext: AuthContext) {
        this.ensureAccess(incidentId, authContext);
        const evidence = await this.requireEvidence(authContext.orgId, incidentId);
        const incidentKey = this.incidentKey(authContext.orgId, incidentId);
        const existingJob = await this.stateStore.getAnalysisJob(incidentKey);

        if (existingJob && ['queued', 'processing'].includes(existingJob.status) && !body.forceRerun) {
            throw new ConflictException('An incident AI analysis job is already queued or processing for this record.');
        }

        const jobId = this.buildId('job');
        const now = new Date().toISOString();
        const job: AnalysisJobRecord = {
            incidentId,
            orgId: authContext.orgId,
            jobId,
            status: 'queued',
            stage: 'queued',
            progressPercent: 0,
            startedAt: now,
            updatedAt: now,
            requestedBy: authContext.uid,
            request: {
                forceRerun: body.forceRerun,
                includeVideo: body.includeVideo,
                includeAudioTranscript: body.includeAudioTranscript,
                frameSampleSeconds: body.frameSampleSeconds,
                maxFrames: body.maxFrames,
                analysisLanguage: body.analysisLanguage,
                incidentContext: body.incidentContext
                    ? { ...body.incidentContext }
                    : undefined
            }
        };

        await this.stateStore.setAnalysisJob(incidentKey, job);
        await this.stateStore.deleteAnalysisResult(incidentKey);
        this.workerService.enqueue(incidentKey);

        return {
            incidentId: evidence.incidentId,
            jobId,
            status: 'queued'
        };
    }

    async getAnalysisStatus(incidentId: string, authContext: AuthContext) {
        this.ensureAccess(incidentId, authContext);
        const job = await this.stateStore.getAnalysisJob(this.incidentKey(authContext.orgId, incidentId));
        if (!job) {
            throw new NotFoundException('No incident AI analysis job found for this incident.');
        }

        return {
            incidentId: job.incidentId,
            jobId: job.jobId,
            status: job.status,
            stage: job.stage,
            progressPercent: job.progressPercent,
            startedAt: job.startedAt,
            updatedAt: job.updatedAt,
            completedAt: job.completedAt,
            failureMessage: job.failureMessage || ''
        };
    }

    async getAnalysisResult(incidentId: string, authContext: AuthContext) {
        this.ensureAccess(incidentId, authContext);
        const key = this.incidentKey(authContext.orgId, incidentId);
        const job = await this.stateStore.getAnalysisJob(key);
        const result = await this.stateStore.getAnalysisResult(key);

        if (!job) {
            throw new NotFoundException('No incident AI analysis job found for this incident.');
        }
        if (job.status !== 'completed' || !result) {
            throw new ConflictException('Incident AI analysis is not completed yet.');
        }

        return result;
    }

    async retryAnalysis(incidentId: string, body: RetryAnalysisDto, authContext: AuthContext) {
        this.ensureAccess(incidentId, authContext);
        const currentResult = await this.stateStore.getAnalysisResult(this.incidentKey(authContext.orgId, incidentId));

        return this.startAnalysis(
            incidentId,
            {
                forceRerun: true,
                frameSampleSeconds: body.override?.frameSampleSeconds,
                maxFrames: body.override?.maxFrames,
                includeAudioTranscript: true,
                includeVideo: true,
                analysisLanguage: 'en',
                incidentContext: {
                    description: body.reason || currentResult?.draft.eventSummary || 'Retry requested for incident AI analysis.'
                }
            },
            authContext
        );
    }

    private ensureAccess(incidentId: string, authContext: AuthContext) {
        if (!authContext?.orgId) {
            throw new ForbiddenException('Missing organization context.');
        }
        if (!incidentId.trim()) {
            throw new NotFoundException('Incident ID is required.');
        }
    }

    private async requireUploadSession(uploadSessionId: string, incidentId: string, orgId: string) {
        const uploadSession = await this.stateStore.getUploadSession(uploadSessionId);
        if (!uploadSession || uploadSession.incidentId !== incidentId || uploadSession.orgId !== orgId) {
            throw new NotFoundException('Upload session not found for this incident.');
        }
        return uploadSession;
    }

    private requireUploadedFile(uploadSession: UploadSessionRecord, kind: 'photo' | 'video') {
        const file = uploadSession.uploadedFiles[kind];
        if (!file) {
            throw new ConflictException(`The ${kind} evidence file has not been uploaded yet.`);
        }
        return file;
    }

    private async requireEvidence(orgId: string, incidentId: string) {
        const evidence = await this.stateStore.getEvidenceRecord(this.incidentKey(orgId, incidentId));
        if (!evidence?.photo && !evidence?.video) {
            throw new ConflictException('Confirmed incident photo or video evidence is required before AI analysis can start.');
        }
        return evidence;
    }

    private incidentKey(orgId: string, incidentId: string) {
        return `${orgId}::${incidentId}`;
    }

    private buildId(prefix: string) {
        return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    }

    private normalizeUploadKind(kind: string): 'photo' | 'video' {
        const normalized = String(kind || '').trim().toLowerCase();
        if (normalized === 'photo' || normalized === 'video') {
            return normalized;
        }
        throw new BadRequestException('Upload kind must be either photo or video.');
    }

    private buildUploadTarget(
        orgId: string,
        incidentId: string,
        uploadSessionId: string,
        kind: 'photo' | 'video',
        fileName: string,
        mimeType: string
    ) {
        const extension = fileName.includes('.') ? fileName.split('.').pop() : (kind === 'photo' ? 'jpg' : 'mp4');
        const normalizedName = `${kind}-original.${extension}`;
        const storagePath = `orgs/${orgId}/incidents/${incidentId}/evidence/${normalizedName}`;

        return {
            storagePath,
            uploadUrl: `/api/v1/incidents/${encodeURIComponent(incidentId)}/ai-evidence/upload/${encodeURIComponent(uploadSessionId)}/${kind}`,
            headers: {
                'Content-Type': mimeType
            }
        };
    }
}
