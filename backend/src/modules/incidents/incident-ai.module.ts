import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IncidentAiController } from './incident-ai.controller';
import { IncidentAiMediaService } from './incident-ai-media.service';
import { IncidentAiProviderService } from './incident-ai-provider.service';
import { IncidentAiStateStoreService } from './incident-ai-state-store.service';
import { IncidentAiService } from './incident-ai.service';
import { IncidentAiStorageService } from './incident-ai-storage.service';
import { IncidentAiWorkerService } from './incident-ai-worker.service';

@Module({
    imports: [AuthModule],
    controllers: [IncidentAiController],
    providers: [
        IncidentAiService,
        IncidentAiStorageService,
        IncidentAiStateStoreService,
        IncidentAiMediaService,
        IncidentAiProviderService,
        IncidentAiWorkerService
    ],
    exports: [
        IncidentAiStateStoreService,
        IncidentAiMediaService,
        IncidentAiWorkerService
    ]
})
export class IncidentAiModule {}
