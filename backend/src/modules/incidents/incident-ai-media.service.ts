import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { IncidentEvidenceRecord, MediaExtractionContext } from './incident-ai.types';
import { IncidentAiStorageService } from './incident-ai-storage.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegBinary = require('ffmpeg-static') as string | null;

@Injectable()
export class IncidentAiMediaService {
    constructor(private readonly storageService: IncidentAiStorageService) {}

    getHealthSnapshot() {
        return {
            ffmpegAvailable: Boolean(ffmpegBinary),
            frameSampleSecondsDefault: Number(process.env.INCIDENT_AI_FRAME_SAMPLE_SECONDS || 2),
            maxFramesDefault: Number(process.env.INCIDENT_AI_MAX_FRAMES || 8)
        };
    }

    async prepareMediaContext(
        evidence: IncidentEvidenceRecord,
        options: {
            frameSampleSeconds?: number;
            maxFrames?: number;
            includeAudioTranscript?: boolean;
            includeVideo?: boolean;
        }
    ): Promise<MediaExtractionContext> {
        const warnings: string[] = [];
        const photoDataUrls = evidence.uploaded.photo
            ? [
                await this.storageService.readFileAsDataUrl(
                    evidence.uploaded.photo.absolutePath,
                    evidence.uploaded.photo.mimeType
                )
            ]
            : [];

        const context: MediaExtractionContext = {
            incidentId: evidence.incidentId,
            warnings,
            photoDataUrls,
            frameDataUrls: [],
            derivedFrames: []
        };

        const shouldProcessVideo = Boolean(options.includeVideo && evidence.uploaded.video);
        if (!shouldProcessVideo || !evidence.uploaded.video) {
            return context;
        }

        if (!ffmpegBinary) {
            warnings.push('FFmpeg binary is not available, so video-derived audio and frames were skipped.');
            return context;
        }

        const derivedDir = path.dirname(
            this.storageService.resolveStoragePath(
                this.storageService.buildDerivedStoragePath(evidence.orgId, evidence.incidentId, 'placeholder.txt')
            )
        );
        await fs.mkdir(derivedDir, { recursive: true });

        if (options.includeAudioTranscript) {
            try {
                context.derivedAudio = await this.extractAudio(evidence, derivedDir);
            } catch (error) {
                warnings.push(`Audio extraction skipped: ${this.normalizeError(error)}`);
            }
        }

        try {
            const derivedFrames = await this.extractFrames(evidence, derivedDir, {
                frameSampleSeconds: options.frameSampleSeconds,
                maxFrames: options.maxFrames
            });
            context.derivedFrames = derivedFrames;
            context.frameDataUrls = await Promise.all(
                derivedFrames.map((frame) => this.storageService.readFileAsDataUrl(frame.absolutePath, frame.mimeType))
            );
        } catch (error) {
            warnings.push(`Frame extraction skipped: ${this.normalizeError(error)}`);
        }

        return context;
    }

    private async extractAudio(evidence: IncidentEvidenceRecord, derivedDir: string) {
        const absolutePath = path.join(derivedDir, 'audio-track.mp3');
        await this.runFfmpeg([
            '-y',
            '-i',
            evidence.uploaded.video!.absolutePath,
            '-vn',
            '-acodec',
            'libmp3lame',
            absolutePath
        ]);

        const buffer = await fs.readFile(absolutePath);
        return await this.storageService.writeDerivedFile({
            storagePath: this.storageService.buildDerivedStoragePath(evidence.orgId, evidence.incidentId, 'audio-track.mp3'),
            buffer,
            mimeType: 'audio/mpeg',
            fileName: 'audio-track.mp3'
        }) as { storagePath: string; absolutePath: string; mimeType: string };
    }

    private async extractFrames(
        evidence: IncidentEvidenceRecord,
        derivedDir: string,
        {
            frameSampleSeconds = Number(process.env.INCIDENT_AI_FRAME_SAMPLE_SECONDS || 2),
            maxFrames = Number(process.env.INCIDENT_AI_MAX_FRAMES || 8)
        }: {
            frameSampleSeconds?: number;
            maxFrames?: number;
        }
    ) {
        const outputPattern = path.join(derivedDir, 'frame-%03d.jpg');
        await this.runFfmpeg([
            '-y',
            '-i',
            evidence.uploaded.video!.absolutePath,
            '-vf',
            `fps=1/${Math.max(1, frameSampleSeconds)}`,
            '-frames:v',
            String(Math.max(1, maxFrames)),
            outputPattern
        ]);

        const files = (await fs.readdir(derivedDir))
            .filter((file) => /^frame-\d+\.jpg$/i.test(file))
            .sort();

        const derivedFrames = [];
        for (const fileName of files) {
            const absolutePath = path.join(derivedDir, fileName);
            const buffer = await fs.readFile(absolutePath);
            derivedFrames.push((await this.storageService.writeDerivedFile({
                storagePath: this.storageService.buildDerivedStoragePath(evidence.orgId, evidence.incidentId, fileName),
                buffer,
                mimeType: 'image/jpeg',
                fileName
            })) as { storagePath: string; absolutePath: string; mimeType: string; fileName: string });
        }

        return derivedFrames;
    }

    private runFfmpeg(args: string[]) {
        return new Promise<void>((resolve, reject) => {
            const processRef = spawn(ffmpegBinary as string, args, {
                stdio: ['ignore', 'ignore', 'pipe']
            });

            let stderr = '';
            processRef.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            processRef.on('error', reject);
            processRef.on('close', (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }

                reject(new Error(stderr || `FFmpeg exited with code ${code}.`));
            });
        });
    }

    private normalizeError(error: unknown) {
        if (error instanceof Error) return error.message;
        return String(error || 'Unknown error');
    }
}
