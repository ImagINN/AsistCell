import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller('api/v1/game')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('leaderboard')
  getLeaderboard(
    @Query('period') period: string, 
    @Query('top') top: string
  ) {
    return this.gamificationService.getLeaderboard(period || 'all_time', top ? parseInt(top, 10) : 10);
  }

  @Get('agents/:agentId')
  getProfile(@Param('agentId') agentId: string) {
    return this.gamificationService.getProfile(agentId);
  }

  @Get('agents/:agentId/history')
  getHistory(@Param('agentId') agentId: string) {
    return this.gamificationService.getHistory(agentId);
  }

  @Post('agents/:agentId/points')
  addPoints(
    @Param('agentId') agentId: string,
    @Body() body: { points: number; reason: string; ticketId?: string }
  ) {
    return this.gamificationService.addPoints(agentId, body.points, body.reason, body.ticketId);
  }

  // RabbitMQ üzerinden asenkron event gelirse (Opsiyonel: Ticket çözüldüğünde)
  @EventPattern('ticket.resolved')
  async handleTicketResolved(@Payload() data: any) {
    // data: { ticketId, agentId, slaMet: boolean, customerRating: number }
    if (!data.agentId || !data.ticketId) return;

    let points = 10; // Temel çözüm puanı
    let reason = "Talep çözüldü";

    if (data.slaMet) {
      points += 5;
      reason += " (SLA Hedefi tutturuldu)";
    } else {
      points -= 2;
      reason += " (SLA Hedefi aşıldı)";
    }

    if (data.customerRating >= 4.5) {
      points += 15;
      reason += " (Yüksek Müşteri Memnuniyeti)";
    }

    await this.gamificationService.addPoints(data.agentId, points, reason, data.ticketId, true);
  }

  // Müşteri çözümü puanladığında (rating: 1-5)
  @EventPattern('ticket.rated')
  async handleTicketRated(@Payload() data: any) {
    // data: { ticketId, agentId, rating }
    if (!data.agentId || !data.ticketId || !data.rating) return;

    let points = 0;
    let reason = `Müşteri değerlendirmesi: ${data.rating}/5`;

    if (data.rating === 5) points = 15;
    else if (data.rating === 4) points = 8;
    else if (data.rating === 3) points = 2;
    else points = -5; // 1-2: düşük memnuniyet

    await this.gamificationService.recordRating(data.agentId, data.rating);
    await this.gamificationService.addPoints(data.agentId, points, reason, data.ticketId);
  }
}
