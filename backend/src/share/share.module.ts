// src/share/share.module.ts
import { Module } from '@nestjs/common';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [ShareController],
  providers: [ShareService, PrismaService],
  exports: [ShareService], // <-- IMPORTANTE
})
export class ShareModule {}
