import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IncidentAiModule } from '../incidents/incident-ai.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
    imports: [AuthModule, IncidentAiModule],
    controllers: [HealthController],
    providers: [HealthService]
})
export class HealthModule {}
