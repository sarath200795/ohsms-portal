import { IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class FileDescriptorDto {
    @IsString()
    fileName!: string;

    @IsString()
    mimeType!: string;

    @IsInt()
    @Min(1)
    sizeBytes!: number;
}

export class ConfirmedEvidenceFileDto {
    @IsString()
    storagePath!: string;

    @IsString()
    fileName!: string;

    @IsString()
    mimeType!: string;
}

export class IncidentContextDto {
    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    equipmentInvolved?: string;

    @IsOptional()
    @IsString()
    immediateAction?: string;

    @IsOptional()
    @IsString()
    smartCategory?: string;

    @IsOptional()
    @IsString()
    severity?: string;

    @IsOptional()
    @IsString()
    type?: string;
}

export class AnalysisOverrideDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    frameSampleSeconds?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    maxFrames?: number;
}

export class DraftCapaDto {
    @IsString()
    act!: string;

    @IsString()
    priority!: string;
}

export class FishboneDraftDto {
    @IsOptional()
    @IsObject()
    man?: string[];

    @IsOptional()
    @IsObject()
    machine?: string[];

    @IsOptional()
    @IsObject()
    material?: string[];

    @IsOptional()
    @IsObject()
    method?: string[];

    @IsOptional()
    @IsObject()
    environment?: string[];
}

export class TranscriptSegmentDto {
    @IsInt()
    @Min(0)
    startMs!: number;

    @IsInt()
    @Min(0)
    endMs!: number;

    @IsString()
    speaker!: string;

    @IsString()
    text!: string;
}

export class ReviewStateDto {
    @IsString()
    @IsIn(['pending', 'accepted', 'edited', 'rejected'])
    status!: string;
}
