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

  async updateLeaderboard(agentId: string, totalScore: number, pointsToAdd: number) {
    const now = new Date();
    // YYYY-MM-DD
    const dailyKey = `leader_board:daily:${now.toISOString().split('T')[0]}`;
    // YYYY-WW (Hafta numarası)
    const getWeek = (d: Date) => {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay()||7));
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
      const weekNo = Math.ceil(( ( (date.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
      return `${date.getUTCFullYear()}-W${weekNo}`;
    };
    const weeklyKey = `leader_board:weekly:${getWeek(now)}`;
    const allTimeKey = 'leader_board:all_time';

    // All-time için direkt ZADD ile toplam skoru eziyoruz (veya ZINCRBY de olabilirdi)
    await this.redisClient.zadd(allTimeKey, totalScore, agentId);

    // Günlük ve Haftalık için o periyot içinde kazanılan puanları üzerine ekliyoruz (ZINCRBY)
    if (pointsToAdd !== 0) {
      await this.redisClient.zincrby(dailyKey, pointsToAdd, agentId);
      await this.redisClient.zincrby(weeklyKey, pointsToAdd, agentId);

      // Anahtarlara TTL ekleyelim ki sonsuza kadar Redis'i şişirmesin (Günlük: 2 gün, Haftalık: 2 hafta)
      await this.redisClient.expire(dailyKey, 60 * 60 * 24 * 2);
      await this.redisClient.expire(weeklyKey, 60 * 60 * 24 * 14);
    }
  }

  async getLeaderboard(period: string = 'all_time', top: number = 10) {
    const now = new Date();
    let key = 'leader_board:all_time';

    if (period === 'daily') {
      key = `leader_board:daily:${now.toISOString().split('T')[0]}`;
    } else if (period === 'weekly') {
      const getWeek = (d: Date) => {
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay()||7));
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
        const weekNo = Math.ceil(( ( (date.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
        return `${date.getUTCFullYear()}-W${weekNo}`;
      };
      key = `leader_board:weekly:${getWeek(now)}`;
    }

    // zrevrange returns elements from highest to lowest score
    const result = await this.redisClient.zrevrange(key, 0, top - 1, 'WITHSCORES');
    
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
    const rank = await this.redisClient.zrevrank('leader_board:all_time', agentId);
    return rank !== null ? rank + 1 : null;
  }

  onModuleDestroy() {
    this.redisClient.quit();
  }
}
