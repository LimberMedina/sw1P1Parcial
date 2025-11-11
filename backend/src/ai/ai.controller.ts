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
import {
  DiagramScannerService,
  DiagramScanResult,
} from './diagram-scanner.service';

export class AnalyzeUmlDto {
  @IsString()
  userInput!: string;
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,

    private readonly assistantService: AiAssistantService,
    private readonly diagramScanner: DiagramScannerService,
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

  @Post('scan-diagram')
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
  async scanDiagram(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AssistantResponse> {
    if (!file) {
      throw new Error('No se proporcionó ningún archivo de imagen');
    }

    console.log('[AI Controller] Escaneando diagrama desde imagen:', {
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });

    // Paso 1: Escanear la imagen con OCR + IA
    const scanResult = await this.diagramScanner.scanDiagramImage(file.buffer);

    console.log('[AI Controller] Scan completado:', {
      classCount: scanResult.classes.length,
      relationCount: scanResult.relations.length,
      confidence: scanResult.confidence,
    });

    // Paso 2: Convertir el resultado del scan en sugerencias para el asistente
    const assistantResponse =
      await this.assistantService.convertScanToSuggestions(scanResult);

    console.log('[AI Controller] Sugerencias generadas:', {
      classesCount: assistantResponse.suggestions?.classes?.length || 0,
      relationsCount: assistantResponse.suggestions?.relations?.length || 0,
    });

    return assistantResponse;
  }

  @Post('asistente')
  async getAssistantHelp(
    @Body() body: { context: DiagramContext; message?: string },
  ): Promise<AssistantResponse> {
    // 🔍 DEBUG: Log para verificar que llega el contexto
    console.log('[AI Controller] Petición recibida:', {
      hasContext: !!body.context,
      nodeCount: body.context?.nodes?.length || 0,
      edgeCount: body.context?.edges?.length || 0,
      message: body.message || '(sin mensaje)',
    });

    return this.assistantService.getContextualHelp(body.context, body.message);
  }
}
