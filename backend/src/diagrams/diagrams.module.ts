import { Module } from '@nestjs/common';
import { DiagramsService } from './diagrams.service';
import { DiagramsController } from './diagrams.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [DiagramsController],
  providers: [DiagramsService, PrismaService],
  // 👇 ¡Clave! Exporta el servicio para que otros módulos (ProjectsModule)
  // puedan inyectarlo en sus controllers.
  exports: [DiagramsService],
})
export class DiagramsModule {}
