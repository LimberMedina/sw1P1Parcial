// src/projects/dto/request-edit.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestEditDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;
}
