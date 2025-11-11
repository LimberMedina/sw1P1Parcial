// src/projects/projects.service.ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ShareService } from '../share/share.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectRole } from '@prisma/client';

type Snapshot = { nodes: any[]; edges: any[] };

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private share: ShareService,
  ) {}

  /* =========================================================
   * Proyectos
   * =======================================================*/

  async create(ownerId: string, dto: CreateProjectDto) {
    // Crea proyecto + membresía OWNER + Diagram vacío
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        ownerId,
        members: {
          create: {
            userId: ownerId,
            role: 'OWNER',
          },
        },
        diagram: {
          create: {
            snapshot: { nodes: [], edges: [] },
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { ...project, role: 'OWNER' as const };
  }

  async listForUser(userId: string) {
    // Proyectos donde soy owner o miembro
    const projects = await this.prisma.project.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        members: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      role: p.ownerId === userId ? 'OWNER' : (p.members[0]?.role ?? 'VIEWER'),
    }));
  }

  async getForUser(userId: string, projectId: string) {
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        members: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (!p) throw new NotFoundException('Proyecto no encontrado');

    const isMember = p.ownerId === userId || p.members.length > 0;
    if (!isMember) throw new ForbiddenException('Sin acceso a este proyecto');

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      role: p.ownerId === userId ? 'OWNER' : (p.members[0]?.role ?? 'VIEWER'),
    };
  }

  /* =========================================================
   * Helpers de rol / acceso (usados por gateway y servicios)
   * =======================================================*/

  async getUserRoleInProject(
    userId: string,
    projectId: string,
  ): Promise<ProjectRole | null> {
    const proj = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        members: { where: { userId }, select: { role: true }, take: 1 },
      },
    });
    if (!proj) return null;
    if (proj.ownerId === userId) return 'OWNER';
    return proj.members[0]?.role ?? null;
  }

  /* =========================================================
   * Diagrama (público por token de share) — solo lectura
   * =======================================================*/

  async getDiagramForShare(projectId: string, token: string) {
    const linkRole = await this.share.validateShareToken(projectId, token);
    if (!linkRole) return null; // token inválido/expirado

    const diagram = await this.prisma.diagram.findUnique({
      where: { projectId },
      select: { snapshot: true, updatedAt: true },
    });

    const snapshot: Snapshot = (diagram?.snapshot as Snapshot) ?? {
      nodes: [],
      edges: [],
    };

    return { snapshot, updatedAt: diagram?.updatedAt ?? null };
  }

  /* =========================================================
   * Solicitudes de edición
   * =======================================================*/

  async createEditRequest(
    requesterId: string,
    projectId: string,
    message?: string,
  ) {
    // Validar existencia de proyecto
    const exists = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });
    if (!exists) throw new NotFoundException('Proyecto no encontrado');

    // Si ya es EDITOR+ no tiene sentido pedir
    const existingMembership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: requesterId } },
      select: { role: true },
    });
    if (
      existingMembership &&
      (existingMembership.role === 'OWNER' ||
        existingMembership.role === 'ADMIN' ||
        existingMembership.role === 'EDITOR')
    ) {
      return { ok: true, skipped: true };
    }

    // Crear (o actualizar a PENDING si ya existía)
    const req = await this.prisma.editRequest.upsert({
      where: { projectId_requesterId: { projectId, requesterId } },
      update: { status: 'PENDING', message: message ?? null },
      create: {
        projectId,
        requesterId,
        message: message ?? null,
      },
      select: {
        id: true,
        projectId: true,
        requesterId: true,
        status: true,
        createdAt: true,
      },
    });

    return { ok: true, request: req };
  }

  /**
   * Aprueba una solicitud: valida que ownerId sea owner del proyecto,
   * crea/actualiza la membership con el rol dado y marca la solicitud como APPROVED.
   */
  async approveEditRequest(
    ownerId: string,
    projectId: string,
    targetUserId: string,
    role: ProjectRole = 'EDITOR',
  ): Promise<boolean> {
    const proj = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });
    if (!proj) throw new NotFoundException('Proyecto no encontrado');
    if (proj.ownerId !== ownerId) throw new ForbiddenException('No autorizado');

    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      update: { role },
      create: { projectId, userId: targetUserId, role },
    });

    await this.prisma.editRequest.updateMany({
      where: { projectId, requesterId: targetUserId, status: 'PENDING' },
      data: { status: 'APPROVED' },
    });

    return true;
  }

  /* =========================================================
   * Eliminar proyecto (solo OWNER)
   * Se elimina en cascada gracias a las reglas de Prisma
   * =======================================================*/
  async deleteProject(ownerId: string, projectId: string) {
    const proj = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });
    if (!proj) throw new NotFoundException('Proyecto no encontrado');
    if (proj.ownerId !== ownerId) throw new ForbiddenException('No autorizado');

    // Eliminar proyecto (las relaciones con onDelete: Cascade se encargarán del resto)
    await this.prisma.project.delete({ where: { id: projectId } });

    return true;
  }
}
