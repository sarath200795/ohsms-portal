import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { ConfirmedEvidenceFileDto } from './shared.dto';

export class ConfirmEvidenceDto {
    @IsString()
    uploadSessionId!: string;

    @ValidateNested()
    @Type(() => ConfirmedEvidenceFileDto)
    photo!: ConfirmedEvidenceFileDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => ConfirmedEvidenceFileDto)
    video?: ConfirmedEvidenceFileDto;

    @IsOptional()
    @IsString()
    notes?: string;
}
