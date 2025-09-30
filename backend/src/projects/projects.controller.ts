import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateProjectDto) {
    const userId: string = req.user.id;
    return this.projects.create(userId, dto);
  }

  @Get()
  async listMine(@Req() req: any) {
    const userId: string = req.user.id;
    return this.projects.listForUser(userId);
  }

  @Get(':id')
  async getOne(@Req() req: any, @Param('id') id: string) {
    const userId: string = req.user.id;
    return this.projects.getForUser(userId, id);
  }
}
