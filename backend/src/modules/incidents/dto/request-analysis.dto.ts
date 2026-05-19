import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { IncidentContextDto } from './shared.dto';

export class RequestAnalysisDto {
    @IsOptional()
    @IsBoolean()
    forceRerun?: boolean;

    @IsOptional()
    @IsBoolean()
    includeVideo?: boolean;

    @IsOptional()
    @IsBoolean()
    includeAudioTranscript?: boolean;

    @IsOptional()
    @IsInt()
    @Min(1)
    frameSampleSeconds?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    maxFrames?: number;

    @IsOptional()
    @IsString()
    analysisLanguage?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => IncidentContextDto)
    incidentContext?: IncidentContextDto;
}
