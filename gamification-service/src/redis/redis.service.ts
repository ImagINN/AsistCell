import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redisClient: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || 'redis_secret',
    });

    this.redisClient.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.redisClient.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });
  }

  getClient(): Redis {
    return this.redisClient;
  }

  async updateLeaderboard(agentId: string, score: number) {
    // leader_board is the sorted set key
    await this.redisClient.zadd('leader_board', score, agentId);
  }

  async getLeaderboard(top: number = 10) {
    // zrevrange returns elements from highest to lowest score
    const result = await this.redisClient.zrevrange('leader_board', 0, top - 1, 'WITHSCORES');
    
    const leaderboard = [];
    for (let i = 0; i < result.length; i += 2) {
      leaderboard.push({
        agentId: result[i],
        score: parseInt(result[i + 1], 10)
      });
    }
    return leaderboard;
  }

  async getAgentRank(agentId: string) {
    const rank = await this.redisClient.zrevrank('leader_board', agentId);
    return rank !== null ? rank + 1 : null;
  }

  onModuleDestroy() {
    this.redisClient.quit();
  }
}
