import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import type { RequestAnalysisDto } from './dto/request-analysis.dto';
import type {
    AnalysisResultRecord,
    IncidentEvidenceRecord,
    MediaExtractionContext
} from './incident-ai.types';

type DraftPayload = AnalysisResultRecord['draft'];

interface ProviderOutput {
    provider: string;
    draft: DraftPayload;
    transcript?: AnalysisResultRecord['transcript'];
    warnings: string[];
}

@Injectable()
export class IncidentAiProviderService {
    async analyze({
        incidentId,
        evidence,
        mediaContext,
        request
    }: {
        incidentId: string;
        evidence: IncidentEvidenceRecord;
        mediaContext: MediaExtractionContext;
        request: RequestAnalysisDto;
    }): Promise<AnalysisResultRecord> {
        const outputs: ProviderOutput[] = [];

        const localOutput = this.buildLocalProviderOutput({
            incidentId,
            evidence,
            mediaContext,
            request
        });
        outputs.push(localOutput);

        const openAiOutput = await this.tryOpenAiProvider({
            evidence,
            mediaContext,
            request
        });
        if (openAiOutput) outputs.push(openAiOutput);

        const webhookOutput = await this.tryWebhookProvider({
            incidentId,
            evidence,
            mediaContext,
            request
        });
        if (webhookOutput) outputs.push(webhookOutput);

        const providerOrder = this.getProviderOrder();
        const providerMap = new Map(outputs.map((output) => [output.provider, output]));
        const orderedOutputs = providerOrder
            .map((provider) => providerMap.get(provider))
            .filter(Boolean) as ProviderOutput[];

        const fallbackOutputs = outputs.filter((output) => !orderedOutputs.some((item) => item.provider === output.provider));
        const resolvedOutputs = [...orderedOutputs, ...fallbackOutputs];
        return {
            incidentId,
            status: 'completed',
            provider: resolvedOutputs.map((output) => output.provider).join('+'),
            providersUsed: resolvedOutputs.map((output) => output.provider),
            transcriptionModel: this.resolveTranscriptionModel(openAiOutput),
            visionModel: this.resolveVisionModel(openAiOutput),
            transcript: this.pickTranscript(resolvedOutputs, localOutput),
            draft: this.mergeDrafts(resolvedOutputs),
            review: {
                status: 'pending'
            },
            mediaContext: {
                derivedFrameCount: mediaContext.derivedFrames.length,
                audioExtracted: Boolean(mediaContext.derivedAudio),
                warnings: [
                    ...mediaContext.warnings,
                    ...resolvedOutputs.flatMap((output) => output.warnings)
                ]
            }
        };
    }

    private buildLocalProviderOutput({
        evidence,
        mediaContext,
        request
    }: {
        incidentId: string;
        evidence: IncidentEvidenceRecord;
        mediaContext: MediaExtractionContext;
        request: RequestAnalysisDto;
    }): ProviderOutput {
        const context = request.incidentContext || {};
        const summary = context.description?.trim()
            || evidence.notes?.trim()
            || 'Incident evidence was uploaded and analyzed to create a draft investigation.';
        const equipment = context.equipmentInvolved?.trim() || 'Equipment under review';
        const hazard = context.smartCategory?.trim() || 'General workplace hazard';
        const severity = context.severity?.trim() || 'Unspecified severity';
        const photoDescriptor = evidence.uploaded.photo
            ? `${evidence.uploaded.photo.fileName} (${Math.round(evidence.uploaded.photo.sizeBytes / 1024)} KB)`
            : '';
        const videoDescriptor = evidence.uploaded.video
            ? `${evidence.uploaded.video.fileName} (${Math.round(evidence.uploaded.video.sizeBytes / 1024)} KB)`
            : '';
        const evidenceSummary = [photoDescriptor, videoDescriptor].filter(Boolean).join(' and ');

        return {
            provider: 'local',
            warnings: [],
            transcript: {
                text: evidence.notes?.trim()
                    || `Stored incident evidence includes ${evidenceSummary || 'uploaded media evidence'}.`,
                segments: [
                    {
                        startMs: 0,
                        endMs: 2500,
                        speaker: 'speaker_1',
                        text: evidence.notes?.trim() || `Initial evidence review references ${equipment} and ${hazard}.`
                    }
                ]
            },
            draft: {
                eventSummary: summary,
                visibleHazards: [
                    ...(evidence.uploaded.photo ? [`Stored photo evidence available at ${evidence.uploaded.photo.storagePath}`] : []),
                    ...(evidence.uploaded.video ? [`Stored video evidence available at ${evidence.uploaded.video.storagePath}`] : []),
                    `Potential ${hazard.toLowerCase()} indicators should be reviewed against saved media`,
                    ...(mediaContext.derivedFrames.length > 0 ? [`${mediaContext.derivedFrames.length} sampled video frames were extracted for review`] : [])
                ],
                equipmentCondition: [
                    `${equipment} identified in incident context`,
                    `Severity context recorded as ${severity}`,
                    ...(evidence.uploaded.photo
                        ? [`Photo evidence checksum ${evidence.uploaded.photo.sha256.slice(0, 12)}... captured for traceability`]
                        : []),
                    ...(evidence.uploaded.video
                        ? [`Video evidence checksum ${evidence.uploaded.video.sha256.slice(0, 12)}... captured for traceability`]
                        : [])
                ],
                immediateCauses: [
                    'Unsafe condition visible or reported in uploaded incident evidence',
                    'Initial controls were not sufficient to prevent exposure'
                ],
                contributingFactors: [
                    'Stored media should be reviewed during the human investigation meeting',
                    'Work method and scene controls should be reviewed against the persisted evidence files'
                ],
                fiveWhys: [
                    `Why 1: The event occurred because workers were exposed to ${hazard.toLowerCase()}.`,
                    `Why 2: ${equipment} or the work area condition was not fully controlled.`,
                    'Why 3: The immediate defect or unsafe condition remained present during the task.',
                    'Why 4: Inspection, maintenance, or supervision controls did not prevent the condition.',
                    'Why 5: Hazard control verification was not strong enough before the work continued.'
                ],
                fishbone: {
                    man: ['Human response and situational awareness should be verified from the stored evidence and witness notes'],
                    machine: [`${equipment} condition requires engineering verification`],
                    material: ['Material, fluid, or energy source should be confirmed from persisted scene evidence'],
                    method: ['Safe work method and isolation controls should be checked against the event sequence'],
                    environment: ['Scene layout and exposure path should be reviewed from the stored evidence package']
                },
                rootCause: `Initial AI draft suggests that ${equipment} and surrounding work controls were not sufficiently verified before exposure to ${hazard.toLowerCase()}.`,
                capa: [
                    {
                        act: `Inspect and verify the condition of ${equipment} before return to service`,
                        priority: 'high'
                    },
                    {
                        act: 'Review the stored evidence package with the investigation team and validate the immediate control failures',
                        priority: 'medium'
                    }
                ],
                confidence: 'medium',
                missingInformation: [
                    'Human investigator review is still required',
                    evidence.uploaded.video
                        ? 'Confirm the exact failure point from the stored video sequence'
                        : 'Add witness statements or additional media evidence for stronger sequence validation'
                ]
            }
        };
    }

    private async tryOpenAiProvider({
        evidence,
        mediaContext,
        request
    }: {
        evidence: IncidentEvidenceRecord;
        mediaContext: MediaExtractionContext;
        request: RequestAnalysisDto;
    }): Promise<ProviderOutput | null> {
        if (!process.env.OPENAI_API_KEY || String(process.env.INCIDENT_AI_ENABLE_OPENAI || 'true').toLowerCase() !== 'true') {
            return null;
        }

        try {
            const transcript = mediaContext.derivedAudio
                ? await this.requestOpenAiTranscript(mediaContext.derivedAudio.absolutePath)
                : null;
            const draft = await this.requestOpenAiDraft({
                request,
                evidence,
                mediaContext,
                transcriptText: transcript?.text || evidence.notes || ''
            });

            return {
                provider: 'openai',
                transcript: transcript || undefined,
                draft,
                warnings: []
            };
        } catch (error) {
            return {
                provider: 'openai',
                draft: this.emptyDraft(),
                warnings: [`OpenAI provider skipped: ${this.normalizeError(error)}`]
            };
        }
    }

    private async tryWebhookProvider({
        incidentId,
        evidence,
        mediaContext,
        request
    }: {
        incidentId: string;
        evidence: IncidentEvidenceRecord;
        mediaContext: MediaExtractionContext;
        request: RequestAnalysisDto;
    }): Promise<ProviderOutput | null> {
        const webhookUrl = String(process.env.INCIDENT_AI_WEBHOOK_URL || '').trim();
        if (!webhookUrl) return null;

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(process.env.INCIDENT_AI_WEBHOOK_API_KEY
                        ? { Authorization: `Bearer ${process.env.INCIDENT_AI_WEBHOOK_API_KEY}` }
                        : {})
                },
                body: JSON.stringify({
                    incidentId,
                    incidentContext: request.incidentContext || {},
                    notes: evidence.notes || '',
                    mediaContext: {
                        photoCount: mediaContext.photoDataUrls.length,
                        frameCount: mediaContext.frameDataUrls.length,
                        audioExtracted: Boolean(mediaContext.derivedAudio),
                        warnings: mediaContext.warnings
                    }
                })
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.message || `Webhook provider failed with status ${response.status}.`);
            }

            return {
                provider: 'webhook',
                transcript: payload?.transcript ? payload.transcript : undefined,
                draft: this.normalizeDraft(payload?.draft || payload),
                warnings: []
            };
        } catch (error) {
            return {
                provider: 'webhook',
                draft: this.emptyDraft(),
                warnings: [`Webhook provider skipped: ${this.normalizeError(error)}`]
            };
        }
    }

    private async requestOpenAiTranscript(absoluteAudioPath: string) {
        const audioBuffer = await fs.readFile(absoluteAudioPath);
        const form = new FormData();
        form.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe');
        form.append('response_format', 'verbose_json');
        form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio-track.mp3');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: form
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.error?.message || `OpenAI transcription failed with status ${response.status}.`);
        }

        return {
            text: String(payload?.text || '').trim(),
            segments: Array.isArray(payload?.segments)
                ? payload.segments.map((segment: { start?: number; end?: number; speaker?: string; text?: string }) => ({
                    startMs: Math.round(Number(segment.start || 0) * 1000),
                    endMs: Math.round(Number(segment.end || 0) * 1000),
                    speaker: segment.speaker || 'speaker_1',
                    text: segment.text || ''
                }))
                : []
        };
    }

    private async requestOpenAiDraft({
        request,
        evidence,
        mediaContext,
        transcriptText
    }: {
        request: RequestAnalysisDto;
        evidence: IncidentEvidenceRecord;
        mediaContext: MediaExtractionContext;
        transcriptText: string;
    }) {
        const model = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
        const content: Array<Record<string, string>> = [
            {
                type: 'input_text',
                text: [
                    'You are generating a draft incident investigation JSON.',
                    'Return valid JSON only with keys:',
                    'eventSummary, visibleHazards, equipmentCondition, immediateCauses, contributingFactors, fiveWhys, fishbone, rootCause, capa, confidence, missingInformation.',
                    `Incident title: ${request.incidentContext?.title || ''}`,
                    `Description: ${request.incidentContext?.description || ''}`,
                    `Equipment involved: ${request.incidentContext?.equipmentInvolved || ''}`,
                    `Immediate action: ${request.incidentContext?.immediateAction || ''}`,
                    `Category: ${request.incidentContext?.smartCategory || ''}`,
                    `Severity: ${request.incidentContext?.severity || ''}`,
                    `Incident type: ${request.incidentContext?.type || ''}`,
                    `Evidence notes: ${evidence.notes || ''}`,
                    `Transcript context: ${transcriptText || ''}`
                ].join('\n')
            }
        ];

        mediaContext.photoDataUrls.slice(0, 1).forEach((imageUrl) => {
            content.push({
                type: 'input_image',
                image_url: imageUrl
            });
        });
        mediaContext.frameDataUrls.slice(0, Number(process.env.INCIDENT_AI_OPENAI_MAX_FRAMES || 4)).forEach((imageUrl) => {
            content.push({
                type: 'input_image',
                image_url: imageUrl
            });
        });

        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model,
                input: [
                    {
                        role: 'user',
                        content
                    }
                ]
            })
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.error?.message || `OpenAI vision analysis failed with status ${response.status}.`);
        }

        return this.normalizeDraft(this.extractJsonPayload(payload?.output_text || ''));
    }

    private getProviderOrder() {
        const configured = String(process.env.INCIDENT_AI_PROVIDER_ORDER || 'webhook,openai,local')
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean);

        return Array.from(new Set([...configured, 'local']));
    }

    private resolveTranscriptionModel(openAiOutput: ProviderOutput | null) {
        return openAiOutput ? (process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe') : 'local-media-context';
    }

    private resolveVisionModel(openAiOutput: ProviderOutput | null) {
        return openAiOutput ? (process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini') : 'local-evidence-pipeline';
    }

    private pickTranscript(outputs: ProviderOutput[], localOutput: ProviderOutput) {
        return outputs.find((output) => output.transcript?.text)?.transcript || localOutput.transcript!;
    }

    private mergeDrafts(outputs: ProviderOutput[]): DraftPayload {
        const drafts = outputs.map((output) => output.draft);
        return {
            eventSummary: this.pickString(drafts, 'eventSummary'),
            visibleHazards: this.mergeStringArrays(drafts.map((draft) => draft.visibleHazards)),
            equipmentCondition: this.mergeStringArrays(drafts.map((draft) => draft.equipmentCondition)),
            immediateCauses: this.mergeStringArrays(drafts.map((draft) => draft.immediateCauses)),
            contributingFactors: this.mergeStringArrays(drafts.map((draft) => draft.contributingFactors)),
            fiveWhys: this.mergeStringArrays(drafts.map((draft) => draft.fiveWhys)),
            fishbone: {
                man: this.mergeStringArrays(drafts.map((draft) => draft.fishbone?.man || [])),
                machine: this.mergeStringArrays(drafts.map((draft) => draft.fishbone?.machine || [])),
                material: this.mergeStringArrays(drafts.map((draft) => draft.fishbone?.material || [])),
                method: this.mergeStringArrays(drafts.map((draft) => draft.fishbone?.method || [])),
                environment: this.mergeStringArrays(drafts.map((draft) => draft.fishbone?.environment || []))
            },
            rootCause: this.pickString(drafts, 'rootCause'),
            capa: this.mergeCapa(drafts.map((draft) => draft.capa || [])),
            confidence: this.pickString(drafts, 'confidence') || 'medium',
            missingInformation: this.mergeStringArrays(drafts.map((draft) => draft.missingInformation))
        };
    }

    private pickString(drafts: DraftPayload[], key: keyof DraftPayload) {
        const found = drafts.find((draft) => typeof draft[key] === 'string' && String(draft[key]).trim());
        return (found?.[key] as string) || '';
    }

    private mergeStringArrays(collections: string[][]) {
        const merged = new Set<string>();
        collections.flat().forEach((item) => {
            const normalized = String(item || '').trim();
            if (normalized) merged.add(normalized);
        });
        return [...merged];
    }

    private mergeCapa(collections: DraftPayload['capa'][]) {
        const seen = new Set<string>();
        const merged: DraftPayload['capa'] = [];

        collections.flat().forEach((item) => {
            const action = String(item?.act || '').trim();
            if (!action) return;
            const key = action.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            merged.push({
                act: action,
                priority: item.priority || 'medium'
            });
        });

        return merged;
    }

    private normalizeDraft(raw: unknown): DraftPayload {
        const draft = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
        return {
            eventSummary: String(draft.eventSummary || ''),
            visibleHazards: this.ensureStringArray(draft.visibleHazards),
            equipmentCondition: this.ensureStringArray(draft.equipmentCondition),
            immediateCauses: this.ensureStringArray(draft.immediateCauses),
            contributingFactors: this.ensureStringArray(draft.contributingFactors),
            fiveWhys: this.ensureStringArray(draft.fiveWhys),
            fishbone: {
                man: this.ensureStringArray((draft.fishbone as Record<string, unknown> | undefined)?.man),
                machine: this.ensureStringArray((draft.fishbone as Record<string, unknown> | undefined)?.machine),
                material: this.ensureStringArray((draft.fishbone as Record<string, unknown> | undefined)?.material),
                method: this.ensureStringArray((draft.fishbone as Record<string, unknown> | undefined)?.method),
                environment: this.ensureStringArray((draft.fishbone as Record<string, unknown> | undefined)?.environment)
            },
            rootCause: String(draft.rootCause || ''),
            capa: Array.isArray(draft.capa)
                ? draft.capa.map((item) => ({
                    act: String((item as Record<string, unknown>)?.act || ''),
                    priority: String((item as Record<string, unknown>)?.priority || 'medium')
                })).filter((item) => item.act)
                : [],
            confidence: String(draft.confidence || ''),
            missingInformation: this.ensureStringArray(draft.missingInformation)
        };
    }

    private ensureStringArray(value: unknown) {
        return Array.isArray(value)
            ? value.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
    }

    private extractJsonPayload(text: string) {
        const trimmed = String(text || '').trim();
        if (!trimmed) return {};
        try {
            return JSON.parse(trimmed);
        } catch {
            const firstBrace = trimmed.indexOf('{');
            const lastBrace = trimmed.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
            }
            throw new Error('OpenAI response did not contain valid JSON.');
        }
    }

    private emptyDraft(): DraftPayload {
        return {
            eventSummary: '',
            visibleHazards: [],
            equipmentCondition: [],
            immediateCauses: [],
            contributingFactors: [],
            fiveWhys: [],
            fishbone: {
                man: [],
                machine: [],
                material: [],
                method: [],
                environment: []
            },
            rootCause: '',
            capa: [],
            confidence: '',
            missingInformation: []
        };
    }

    private normalizeError(error: unknown) {
        if (error instanceof Error) return error.message;
        return String(error || 'Unknown error');
    }
}
