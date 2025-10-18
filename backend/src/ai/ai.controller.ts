import {
  Body,
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AiService, AiResponse } from './ai.service';
import { IsString } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors, UploadedFile } from '@nestjs/common';

import {
  AiAssistantService,
  DiagramContext,
  AssistantResponse,
} from './asistente';

export class AnalyzeUmlDto {
  @IsString()
  userInput!: string;
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,

    private readonly assistantService: AiAssistantService,
  ) {}

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

  @Post('analyze-image')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB máximo
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png|gif|bmp|webp)$/)) {
          cb(null, true);
        } else {
          cb(new Error('Solo se permiten archivos de imagen'), false);
        }
      },
    }),
  )
  async analyzeImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AiResponse> {
    if (!file) {
      throw new Error('No se proporcionó ningún archivo de imagen');
    }

    return this.aiService.analyzeUmlFromImage(file.buffer);
  }

  @Post('asistente')
  async getAssistantHelp(
    @Body() body: { context: DiagramContext; message?: string },
  ): Promise<AssistantResponse> {
    return this.assistantService.getContextualHelp(body.context, body.message);
  }
}
