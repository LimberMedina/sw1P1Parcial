// src/share/share.service.ts
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ProjectRole } from '@prisma/client';
import { randomUUID } from 'crypto';

@Injectable()
export class ShareService {
  constructor(private prisma: PrismaService) {}

  private async ensureOwner(userId: string, projectId: string) {
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!p) throw new NotFoundException('Proyecto no encontrado');
    if (p.ownerId !== userId)
      throw new ForbiddenException('Solo el owner puede administrar el link');
  }

  async createLink(
    userId: string,
    projectId: string,
    role: ProjectRole,
    expiresAt?: string,
  ) {
    await this.ensureOwner(userId, projectId);
    const token = randomUUID();
    return this.prisma.projectShareLink.create({
      data: {
        projectId,
        token,
        role,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      select: { token: true, role: true, expiresAt: true },
    });
  }

  async getLink(userId: string, projectId: string) {
    await this.ensureOwner(userId, projectId);
    const now = new Date();
    const link = await this.prisma.projectShareLink.findFirst({
      where: {
        projectId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { token: true, role: true, expiresAt: true },
    });
    return link || null;
  }

  // Usado por el gateway para validar el acceso por token (viewer)
  async validateShareToken(projectId: string, token: string) {
    const link = await this.prisma.projectShareLink.findFirst({
      where: { projectId, token },
      select: { role: true, expiresAt: true },
    });
    if (!link) return null;
    if (link.expiresAt && link.expiresAt <= new Date()) return null;
    return link.role; // ProjectRole
  }
}
