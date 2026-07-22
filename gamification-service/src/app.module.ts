import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { GamificationModule } from './gamification/gamification.module';

@Module({
  imports: [PrismaModule, RedisModule, GamificationModule],
})
export class AppModule {}
