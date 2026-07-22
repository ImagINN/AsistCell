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
      await this.redisService.updateLeaderboard(agentId, 0, 0);
    }

    const rank = await this.redisService.getAgentRank(agentId);
    return { ...profile, rank };
  }

  async addPoints(
    agentId: string,
    points: number,
    reason: string,
    ticketId?: string,
    countResolved = false,
  ) {
    // 1. Profili bul veya oluştur
    await this.prisma.agentProfile.upsert({
      where: { id: agentId },
      create: { id: agentId },
      update: {},
    });

    // 2. İşlemleri Transaction içinde yap.
    // totalPoints atomik increment ile güncellenir — eşzamanlı eventlerde
    // (örn. ticket.resolved + ticket.rated art arda) read-modify-write
    // kayıp güncellemeye yol açıyordu.
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

      const incremented = await tx.agentProfile.update({
        where: { id: agentId },
        data: {
          totalPoints: { increment: points },
          totalResolvedTickets: countResolved ? { increment: 1 } : undefined,
        },
      });

      // Seviye, artırılmış güncel puana göre hesaplanır
      return await tx.agentProfile.update({
        where: { id: agentId },
        data: { currentLevel: this.calculateLevel(incremented.totalPoints) },
        include: { badges: true },
      });
    });

    // 3. Redis Leaderboard'u güncelle
    await this.redisService.updateLeaderboard(agentId, updatedProfile.totalPoints, points);

    // 4. Otomatik Rozet Kontrolü (Kurallar)
    await this.checkAndAwardBadges(agentId, updatedProfile);

    return updatedProfile;
  }

  // Müşteri puanlaması geldiğinde ortalama memnuniyeti günceller
  async recordRating(agentId: string, rating: number) {
    await this.prisma.agentProfile.upsert({
      where: { id: agentId },
      create: { id: agentId },
      update: {},
    });

    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.agentProfile.findUniqueOrThrow({ where: { id: agentId } });
      const newCount = profile.ratedCount + 1;
      const newAvg = (profile.averageRating * profile.ratedCount + rating) / newCount;

      await tx.agentProfile.update({
        where: { id: agentId },
        data: { averageRating: newAvg, ratedCount: newCount },
      });
    });
  }

  async checkAndAwardBadges(agentId: string, profile: any) {
    const existingBadges = profile.badges.map((b: any) => b.badgeType);

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

  async getLeaderboard(period: string = 'all_time', top: number = 10) {
    const rawLeaderboard = await this.redisService.getLeaderboard(period, top);
    
    if (rawLeaderboard.length === 0) return [];

    const agentIds = rawLeaderboard.map(item => item.agentId);

    const profiles = await this.prisma.agentProfile.findMany({
      where: { id: { in: agentIds } },
      include: { badges: true },
    });

    // Puan sırasını bozmadan rozetleri ve seviyeyi birleştir
    return rawLeaderboard.map(item => {
      const profile = profiles.find(p => p.id === item.agentId);
      return {
        agentId: item.agentId,
        score: item.score,
        level: profile?.currentLevel || Level.BRONZE,
        badges: profile?.badges.map(b => b.badgeType) || [],
      };
    });
  }

  async getHistory(agentId: string) {
    return this.prisma.pointHistory.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
