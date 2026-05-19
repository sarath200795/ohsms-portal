import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentAuthContext } from '../../shared/decorators/current-auth-context.decorator';
import { getIncidentAiMaxUploadBytes } from '../../shared/runtime-config';
import type { AuthContext } from '../../shared/types/auth-context';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ConfirmEvidenceDto } from './dto/confirm-evidence.dto';
import { CreateUploadSessionDto } from './dto/create-upload-session.dto';
import { RequestAnalysisDto } from './dto/request-analysis.dto';
import { RetryAnalysisDto } from './dto/retry-analysis.dto';
import { IncidentAiService } from './incident-ai.service';

const maxUploadBytes = getIncidentAiMaxUploadBytes();

@Controller('incidents/:incidentId')
@UseGuards(FirebaseAuthGuard)
export class IncidentAiController {
    constructor(private readonly incidentAiService: IncidentAiService) {}

    @Post('ai-evidence/upload-session')
    createUploadSession(
        @Param('incidentId') incidentId: string,
        @Body() body: CreateUploadSessionDto,
        @CurrentAuthContext() authContext: AuthContext
    ) {
        return this.incidentAiService.createUploadSession(incidentId, body, authContext);
    }

    @Post('ai-evidence/upload/:uploadSessionId/:kind')
    @UseInterceptors(FileInterceptor('file', {
        limits: {
            fileSize: maxUploadBytes
        }
    }))
    uploadEvidence(
        @Param('incidentId') incidentId: string,
        @Param('uploadSessionId') uploadSessionId: string,
        @Param('kind') kind: string,
        @UploadedFile() file: {
            originalname?: string;
            mimetype?: string;
            size?: number;
            buffer?: Buffer;
        } | undefined,
        @CurrentAuthContext() authContext: AuthContext
    ) {
        return this.incidentAiService.uploadEvidenceFile(incidentId, uploadSessionId, kind, file, authContext);
    }

    @Post('ai-evidence/confirm')
    confirmEvidence(
        @Param('incidentId') incidentId: string,
        @Body() body: ConfirmEvidenceDto,
        @CurrentAuthContext() authContext: AuthContext
    ) {
        return this.incidentAiService.confirmEvidence(incidentId, body, authContext);
    }

    @Post('ai-analysis')
    startAnalysis(
        @Param('incidentId') incidentId: string,
        @Body() body: RequestAnalysisDto,
        @CurrentAuthContext() authContext: AuthContext
    ) {
        return this.incidentAiService.startAnalysis(incidentId, body, authContext);
    }

    @Get('ai-analysis/status')
    getAnalysisStatus(
        @Param('incidentId') incidentId: string,
        @CurrentAuthContext() authContext: AuthContext
    ) {
        return this.incidentAiService.getAnalysisStatus(incidentId, authContext);
    }

    @Get('ai-analysis')
    getAnalysisResult(
        @Param('incidentId') incidentId: string,
        @CurrentAuthContext() authContext: AuthContext
    ) {
        return this.incidentAiService.getAnalysisResult(incidentId, authContext);
    }

    @Post('ai-analysis/retry')
    retryAnalysis(
        @Param('incidentId') incidentId: string,
        @Body() body: RetryAnalysisDto,
        @CurrentAuthContext() authContext: AuthContext
    ) {
        return this.incidentAiService.retryAnalysis(incidentId, body, authContext);
    }
}
