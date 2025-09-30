import {
  Body,
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AiService, AiResponse } from './ai.service';
import { IsString } from 'class-validator';

export class AnalyzeUmlDto {
  @IsString()
  userInput!: string;
}

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('analyze-uml')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async analyzeUml(@Body() dto: AnalyzeUmlDto): Promise<AiResponse> {
    return this.aiService.analyzeUmlRequest(dto.userInput);
  }

  @Post('suggest-cardinality')
  async suggestCardinality(
    @Body()
    body: {
      sourceClass: string;
      targetClass: string;
      sourceAttributes?: string[];
      targetAttributes?: string[];
    },
  ) {
    return this.aiService.suggestCardinality(
      body.sourceClass,
      body.targetClass,
      body.sourceAttributes,
      body.targetAttributes,
    );
  }
}
