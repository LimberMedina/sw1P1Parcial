// src/diagrams/diagrams.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { DiagramsService } from './diagrams.service';

type PayloadA = {
  snapshot?: { nodes?: any[]; edges?: any[] };
  updatedAt?: string;
};
type PayloadB = { nodes?: any[]; edges?: any[]; updatedAt?: string };

function normalize(body: PayloadA | PayloadB) {
  let nodes: any[] | undefined;
  let edges: any[] | undefined;
  const updatedAt: string | undefined = (body as any)?.updatedAt;

  if ('snapshot' in body && body.snapshot) {
    nodes = body.snapshot.nodes;
    edges = body.snapshot.edges;
  } else {
    nodes = (body as PayloadB).nodes;
    edges = (body as PayloadB).edges;
  }

  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    throw new BadRequestException(
      'Payload inválido: nodes y edges deben ser arrays',
    );
  }
  return { nodes, edges, updatedAt };
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/diagram')
export class DiagramsController {
  constructor(private readonly diagrams: DiagramsService) {}

  @Get()
  async get(@Req() req: any, @Param('projectId') projectId: string) {
    const userId: string = req.user.id;
    // Devuelve SIEMPRE el snapshot (objeto con nodes, edges, updatedAt)
    return this.diagrams.getOrInitForUser(userId, projectId);
  }

  @Put()
  async put(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body() body: PayloadA | PayloadB,
  ) {
    const userId: string = req.user.id;
    const payload = normalize(body);
    // Devuelve el snapshot actualizado (útil para confirmar desde el front)
    return this.diagrams.upsertForUser(userId, projectId, payload);
  }
}
