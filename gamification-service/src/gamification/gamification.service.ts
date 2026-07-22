import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Level, BadgeType } from '@prisma/client';

@Injectable()
export class GamificationService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  private calculateLevel(points: number): Level {
    if (points >= 3000) return Level.PLATINUM;
    if (points >= 1500) return Level.GOLD;
    if (points >= 500) return Level.SILVER;
    return Level.BRONZE;
  }

  async getProfile(agentId: string) {
    let profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentId },
      include: { badges: true },
    });

    if (!profile) {
      profile = await this.prisma.agentProfile.create({
        data: { id: agentId },
        include: { badges: true },
      });
      // Redis leaderboard'a sıfır puanla ekle
      await this.redisService.updateLeaderboard(agentId, 0);
    }

    const rank = await this.redisService.getAgentRank(agentId);
    return { ...profile, rank };
  }

  async addPoints(agentId: string, points: number, reason: string, ticketId?: string) {
    // 1. Profili bul veya oluştur
    let profile = await this.prisma.agentProfile.findUnique({ where: { id: agentId } });
    if (!profile) {
      profile = await this.prisma.agentProfile.create({ data: { id: agentId } });
    }

    const newPoints = profile.totalPoints + points;
    const newLevel = this.calculateLevel(newPoints);
    
    // 2. İşlemleri Transaction içinde yap
    const updatedProfile = await this.prisma.$transaction(async (tx) => {
      // Puan geçmişini ekle
      await tx.pointHistory.create({
        data: {
          agentId,
          pointsChanged: points,
          reason,
          ticketId,
        },
      });

      // Profili güncelle
      return await tx.agentProfile.update({
        where: { id: agentId },
        data: {
          totalPoints: newPoints,
          currentLevel: newLevel,
          totalResolvedTickets: ticketId ? { increment: 1 } : undefined, // Eğer ticket id verildiyse çözülmüştür
        },
        include: { badges: true }
      });
    });

    // 3. Redis Leaderboard'u güncelle
    await this.redisService.updateLeaderboard(agentId, newPoints);

    // 4. Otomatik Rozet Kontrolü (Kurallar)
    await this.checkAndAwardBadges(agentId, updatedProfile);

    return updatedProfile;
  }

  async checkAndAwardBadges(agentId: string, profile: any) {
    const existingBadges = profile.badges.map(b => b.badgeType);

    const awardBadge = async (badge: BadgeType) => {
      if (!existingBadges.includes(badge)) {
        await this.prisma.agentBadge.create({
          data: { agentId, badgeType: badge }
        });
      }
    };

    // Örnek Kurallar:
    // ILK_ADIM: 1 ticket çözdüğünde
    if (profile.totalResolvedTickets >= 1) {
      await awardBadge(BadgeType.ILK_ADIM);
    }

    // MARATONCU: 100 ticket çözdüğünde
    if (profile.totalResolvedTickets >= 100) {
      await awardBadge(BadgeType.MARATONCU);
    }

    // UZMAN: Altın seviyesine ulaştığında
    if (profile.currentLevel === Level.GOLD || profile.currentLevel === Level.PLATINUM) {
      await awardBadge(BadgeType.UZMAN);
    }
  }

  async getLeaderboard(top: number = 10) {
    return this.redisService.getLeaderboard(top);
  }

  async getHistory(agentId: string) {
    return this.prisma.pointHistory.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
