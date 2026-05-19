import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { IncidentAiModule } from './modules/incidents/incident-ai.module';

@Module({
    imports: [HealthModule, AuthModule, IncidentAiModule]
})
export class AppModule {}
