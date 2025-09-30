// src/share/dto/create-share-link.dto.ts
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { ProjectRole } from '@prisma/client';

export class CreateShareLinkDto {
  @IsEnum(ProjectRole, { message: 'role inválido' })
  role!: ProjectRole; // normalmente VIEWER

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'expiresAt debe ser ISO8601' })
  expiresAt?: string; // opcional, ej: "2025-12-31T23:59:59.000Z"
}
