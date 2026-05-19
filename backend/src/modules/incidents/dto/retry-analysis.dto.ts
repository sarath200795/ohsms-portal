import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { AnalysisOverrideDto } from './shared.dto';

export class RetryAnalysisDto {
    @IsOptional()
    @IsString()
    reason?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => AnalysisOverrideDto)
    override?: AnalysisOverrideDto;
}
