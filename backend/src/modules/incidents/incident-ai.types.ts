export type AnalysisStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface UploadTarget {
    storagePath: string;
    uploadUrl: string;
    headers: Record<string, string>;
}

export interface UploadedFileRecord {
    kind: 'photo' | 'video';
    storagePath: string;
    absolutePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    uploadedAt: string;
}

export interface DerivedAudioRecord {
    storagePath: string;
    absolutePath: string;
    mimeType: string;
}

export interface DerivedFrameRecord {
    storagePath: string;
    absolutePath: string;
    fileName: string;
    mimeType: string;
}

export interface MediaExtractionContext {
    incidentId: string;
    warnings: string[];
    photoDataUrls: string[];
    frameDataUrls: string[];
    derivedAudio?: DerivedAudioRecord;
    derivedFrames: DerivedFrameRecord[];
}

export interface UploadSessionRecord {
    uploadSessionId: string;
    incidentId: string;
    orgId: string;
    createdBy: string;
    createdAt: string;
    expiresAt: string;
    photo: UploadTarget;
    video?: UploadTarget;
    uploadedFiles: Partial<Record<'photo' | 'video', UploadedFileRecord>>;
}

export interface ConfirmedEvidenceFile {
    storagePath: string;
    fileName: string;
    mimeType: string;
}

export interface IncidentEvidenceRecord {
    incidentId: string;
    orgId: string;
    photo: ConfirmedEvidenceFile;
    video?: ConfirmedEvidenceFile;
    notes?: string;
    confirmedAt: string;
    uploaded: {
        photo: UploadedFileRecord;
        video?: UploadedFileRecord;
    };
}

export interface AnalysisRequestSnapshot {
    forceRerun?: boolean;
    includeVideo?: boolean;
    includeAudioTranscript?: boolean;
    frameSampleSeconds?: number;
    maxFrames?: number;
    analysisLanguage?: string;
    incidentContext?: {
        title?: string;
        description?: string;
        equipmentInvolved?: string;
        immediateAction?: string;
        smartCategory?: string;
        severity?: string;
        type?: string;
    };
}

export interface AnalysisJobRecord {
    incidentId: string;
    orgId: string;
    jobId: string;
    status: AnalysisStatus;
    stage: string;
    progressPercent: number;
    startedAt: string;
    updatedAt: string;
    requestedBy: string;
    request: AnalysisRequestSnapshot;
    completedAt?: string;
    failureMessage?: string;
    workerId?: string;
    leaseExpiresAt?: string;
}

export interface AnalysisResultRecord {
    incidentId: string;
    status: 'completed';
    provider: string;
    providersUsed?: string[];
    transcriptionModel: string;
    visionModel: string;
    transcript: {
        text: string;
        segments: Array<{
            startMs: number;
            endMs: number;
            speaker: string;
            text: string;
        }>;
    };
    draft: {
        eventSummary: string;
        visibleHazards: string[];
        equipmentCondition: string[];
        immediateCauses: string[];
        contributingFactors: string[];
        fiveWhys: string[];
        fishbone: {
            man: string[];
            machine: string[];
            material: string[];
            method: string[];
            environment: string[];
        };
        rootCause: string;
        capa: Array<{
            act: string;
            priority: string;
        }>;
        confidence: string;
        missingInformation: string[];
    };
    review: {
        status: 'pending' | 'accepted' | 'edited' | 'rejected';
    };
    mediaContext?: {
        derivedFrameCount: number;
        audioExtracted: boolean;
        warnings: string[];
    };
}
