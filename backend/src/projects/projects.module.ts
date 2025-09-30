import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { PublicDiagramController } from './public-diagram.controller';
import { EditRequestsController } from './edit-requests.controller';

import { PrismaService } from '../common/prisma.service';
import { ShareModule } from '../share/share.module';
import { DiagramRealtimeModule } from '../diagram-realtime/diagram-realtime.module';

// ✅ Importamos el módulo de diagrams para reutilizar su service (misma fuente de verdad)
import { DiagramsModule } from '../diagrams/diagrams.module';

@Module({
  imports: [
    ShareModule,
    DiagramRealtimeModule,
    DiagramsModule, // <- clave para poder inyectar DiagramsService en el controller público
  ],
  controllers: [
    ProjectsController,
    PublicDiagramController,
    EditRequestsController,
  ],
  providers: [ProjectsService, PrismaService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
