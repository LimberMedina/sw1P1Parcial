// src/diagram-realtime/diagram-realtime.module.ts
import { Module } from '@nestjs/common';
import { DiagramGateway } from './diagram.gateway';
import { ShareModule } from '../share/share.module';
import { PrismaService } from '../common/prisma.service';
import { RealtimeService } from './realtime.service';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ShareModule,
    RedisModule,
    JwtModule.register({ secret: process.env.JWT_SECRET }),
  ],
  providers: [DiagramGateway, PrismaService, RealtimeService],
  exports: [DiagramGateway], // 👈👈 NECESARIO para inyectarlo en otros módulos
})
export class DiagramRealtimeModule {}
