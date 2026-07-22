import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AiAgentClient } from '../common/ai-agent.client';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AiAgentClient],
  exports: [UsersService],
})
export class UsersModule {}
