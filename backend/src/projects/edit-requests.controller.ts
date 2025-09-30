// src/projects/edit-requests.controller.ts
import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../common/prisma.service';
import { DiagramGateway } from '../diagram-realtime/diagram.gateway';
import { RequestEditDto } from './dto/request-edit.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId')
export class EditRequestsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly prisma: PrismaService,
    private readonly gateway: DiagramGateway, // emitimos al owner por socket
  ) {}

  // POST /api/projects/:projectId/request-edit
  @Post('request-edit')
  async requestEdit(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body() dto: RequestEditDto,
  ) {
    const requesterId: string = req.user.id;

    // Crea (o asegura) la solicitud en BD
    const result = await this.projects.createEditRequest(
      requesterId,
      projectId,
      dto?.message,
    );

    // Verifica proyecto y obtiene owner
    const proj = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!proj) throw new NotFoundException('Proyecto no encontrado');

    // Notifica al owner en su sala "user:<ownerId>"
    // (el gateway mete al socket en esa sala en handleConnection)
    const ns: any = (this.gateway as any).server; // Namespace
    ns?.to?.(`user:${proj.ownerId}`)?.emit?.('editRequest', {
      requestId: result.request?.id,
      projectId,
      requesterId,
      message: dto?.message ?? null,
    });

    return result; // { ok: true, request, skipped? }
  }
}
