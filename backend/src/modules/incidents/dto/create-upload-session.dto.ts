import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { FileDescriptorDto } from './shared.dto';

export class CreateUploadSessionDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => FileDescriptorDto)
    photo?: FileDescriptorDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => FileDescriptorDto)
    video?: FileDescriptorDto;
}
