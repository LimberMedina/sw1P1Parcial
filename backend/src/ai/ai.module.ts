import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiAssistantService } from './asistente';

@Module({
  controllers: [AiController],
  providers: [AiService, AiAssistantService],
  exports: [AiService, AiAssistantService],
})
export class AiModule {}
