import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { DiagramsService } from '../diagrams/diagrams.service';

/**
 * Endpoint público para leer diagramas por share token.
 * Lee SIEMPRE desde la misma fuente que el privado:
 * tabla `diagram` (campo JSON `snapshot`), vía `DiagramsService`.
 *
 * GET /api/public/projects/:projectId/diagram?share=TOKEN
 * Respuesta: { snapshot: { nodes, edges, updatedAt } }
 */
@Controller('public/projects/:projectId/diagram')
export class PublicDiagramController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diagrams: DiagramsService,
  ) {}

  @Get()
  async getDiagramPublic(
    @Param('projectId') projectId: string,
    @Query('share') shareToken?: string,
  ) {
    if (!shareToken) {
      throw new BadRequestException('Token de compartir requerido (share)');
    }

    // 1) Validar que el token pertenece al proyecto (usa TU modelo real)
    const share = await this.prisma.projectShareLink.findFirst({
      where: {
        projectId,
        token: shareToken,
        // ⚠️ No usamos revokedAt porque tu modelo no lo tiene.
        // Si tu modelo tuviera flags/campos de estado, haremos checks abajo.
      },
      // Traemos lo justo; si querés, añade más campos según tus necesidades
      select: {
        id: true,
        // Campos opcionales que podrían existir en TU esquema:
        // expiresAt: true,
        // disabledAt: true,
        // deletedAt: true,
        // revoked: true,
      } as any,
    });

    if (!share) {
      throw new NotFoundException(
        'Proyecto no encontrado o token de compartir inválido',
      );
    }

    // 2) Chequeos genéricos de estado (opcionales y tolerantes al esquema)
    const now = new Date();
    const s: any = share;
    if (
      (s.expiresAt && new Date(s.expiresAt) < now) || // expirado
      s.disabledAt || // deshabilitado
      s.deletedAt || // borrado
      s.revoked === true // revocado (boolean)
    ) {
      throw new NotFoundException(
        'Token de compartir inválido o no vigente para este proyecto',
      );
    }

    // 3) Devolver SIEMPRE lo que hay persistido en `diagram.snapshot`
    //    (misma fuente que el endpoint privado).
    //    Si getOrInit es private, exponé un wrapper público en el service;
    //    aquí usamos indexado para no tocar tu service.
    const snapshot = await (this.diagrams as any)['getOrInit'](projectId);

    return { snapshot };
  }
}
