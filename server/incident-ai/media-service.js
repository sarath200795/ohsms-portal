import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ffmpegBinary from 'ffmpeg-static';

export class VercelIncidentAiMediaService {
    constructor(storageService) {
        this.storageService = storageService;
    }

    getHealthSnapshot() {
        return {
            ffmpegAvailable: Boolean(ffmpegBinary),
            frameSampleSecondsDefault: Number(process.env.INCIDENT_AI_FRAME_SAMPLE_SECONDS || 2),
            maxFramesDefault: Number(process.env.INCIDENT_AI_MAX_FRAMES || 8)
        };
    }

    async prepareMediaContext(evidence, options) {
        const warnings = [];
        const photoDataUrls = evidence.uploaded?.photo
            ? [
                await this.storageService.readFileAsDataUrl(evidence.uploaded.photo, evidence.uploaded.photo.mimeType)
            ]
            : [];

        const context = {
            incidentId: evidence.incidentId,
            warnings,
            photoDataUrls,
            frameDataUrls: [],
            derivedFrames: []
        };

        const shouldProcessVideo = Boolean(options.includeVideo && evidence.uploaded?.video);
        if (!shouldProcessVideo || !evidence.uploaded?.video) {
            return context;
        }

        if (!ffmpegBinary) {
            warnings.push('FFmpeg binary is not available, so video-derived audio and frames were skipped.');
            return context;
        }

        const videoAbsolutePath = await this.storageService.ensureLocalFile(evidence.uploaded.video);
        const derivedDir = path.dirname(this.storageService.resolveStoragePath(
            this.storageService.buildDerivedStoragePath(evidence.orgId, evidence.incidentId, 'placeholder.txt')
        ));
        await fs.mkdir(derivedDir, { recursive: true });

        if (options.includeAudioTranscript) {
            try {
                context.derivedAudio = await this.extractAudio(evidence, videoAbsolutePath, derivedDir);
            } catch (error) {
                warnings.push(`Audio extraction skipped: ${this.normalizeError(error)}`);
            }
        }

        try {
            const derivedFrames = await this.extractFrames(evidence, videoAbsolutePath, derivedDir, {
                frameSampleSeconds: options.frameSampleSeconds,
                maxFrames: options.maxFrames
            });
            context.derivedFrames = derivedFrames;
            context.frameDataUrls = await Promise.all(
                derivedFrames.map((frame) => this.storageService.readFileAsDataUrl(frame, frame.mimeType))
            );
        } catch (error) {
            warnings.push(`Frame extraction skipped: ${this.normalizeError(error)}`);
        }

        return context;
    }

    async extractAudio(evidence, videoAbsolutePath, derivedDir) {
        const absolutePath = path.join(derivedDir, 'audio-track.mp3');
        await this.runFfmpeg([
            '-y',
            '-i',
            videoAbsolutePath,
            '-vn',
            '-acodec',
            'libmp3lame',
            absolutePath
        ]);
        const buffer = await fs.readFile(absolutePath);
        return this.storageService.writeDerivedFile({
            storagePath: this.storageService.buildDerivedStoragePath(evidence.orgId, evidence.incidentId, 'audio-track.mp3'),
            buffer,
            mimeType: 'audio/mpeg',
            fileName: 'audio-track.mp3'
        });
    }

    async extractFrames(evidence, videoAbsolutePath, derivedDir, {
        frameSampleSeconds = Number(process.env.INCIDENT_AI_FRAME_SAMPLE_SECONDS || 2),
        maxFrames = Number(process.env.INCIDENT_AI_MAX_FRAMES || 8)
    }) {
        const outputPattern = path.join(derivedDir, 'frame-%03d.jpg');
        await this.runFfmpeg([
            '-y',
            '-i',
            videoAbsolutePath,
            '-vf',
            `fps=1/${Math.max(1, frameSampleSeconds)}`,
            '-frames:v',
            String(Math.max(1, maxFrames)),
            outputPattern
        ]);

        const files = (await fs.readdir(derivedDir))
            .filter((fileName) => /^frame-\d+\.jpg$/i.test(fileName))
            .sort();

        const derivedFrames = [];
        for (const fileName of files) {
            const absolutePath = path.join(derivedDir, fileName);
            const buffer = await fs.readFile(absolutePath);
            derivedFrames.push(await this.storageService.writeDerivedFile({
                storagePath: this.storageService.buildDerivedStoragePath(evidence.orgId, evidence.incidentId, fileName),
                buffer,
                mimeType: 'image/jpeg',
                fileName
            }));
        }

        return derivedFrames;
    }

    runFfmpeg(args) {
        return new Promise((resolve, reject) => {
            const processRef = spawn(ffmpegBinary, args, {
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

    normalizeError(error) {
        if (error instanceof Error) return error.message;
        return String(error || 'Unknown error');
    }
}
