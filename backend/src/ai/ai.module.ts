import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiAssistantService } from './asistente';
import { DiagramScannerService } from './diagram-scanner.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AiAssistantService, DiagramScannerService],
  exports: [AiService, AiAssistantService, DiagramScannerService],
})
export class AiModule {}
