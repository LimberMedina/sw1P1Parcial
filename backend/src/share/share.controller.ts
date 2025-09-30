// src/share/share.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ShareService } from './share.service';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { JwtAuthGuard } from '../auth/jwt.guard'; // ajusta el path a tu guard real

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/share')
export class ShareController {
  constructor(private share: ShareService) {}

  @Get()
  async getLink(@Req() req: any, @Param('projectId') projectId: string) {
    return this.share.getLink(req.user.id, projectId);
  }

  @Post()
  async create(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body() dto: CreateShareLinkDto,
  ) {
    return this.share.createLink(
      req.user.id,
      projectId,
      dto.role,
      dto.expiresAt,
    );
  }
}
