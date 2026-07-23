import { Controller, Get, Post, Body, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { RateTicketDto } from './dto/rate-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { MessageRole, UserRole, isStaff } from '../common/enums';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuditClient } from '../common/audit.client';

// Kimlik bilgisi client header'larından değil, doğrulanmış JWT payload'ından gelir.
// Yetki matrisi endpoint seviyesinde uygulanır; ihlaller 403 döner ve
// identity-service üzerinden merkezi audit log'a yazılır (AuditClient.deny).
@ApiTags('tickets')
@ApiBearerAuth('access-token')
@Controller('api/v1/tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly auditClient: AuditClient,
  ) {}

  // Docker healthcheck için kimliksiz endpoint.
  // NestJS rotaları tanım sırasıyla eşleştirdiği için ':ticketNumber'dan önce gelmeli.
  @ApiOperation({ summary: 'Sağlık kontrolü (kimliksiz)' })
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'ticket-service' };
  }

  // Talep oluşturma — yalnızca müşteri (USER)
  @ApiOperation({ summary: 'Talep oluştur', description: 'Yalnızca USER rolü. Oluşturma anında AI Service\'e asenkron analiz isteği gönderilir.' })
  @Post()
  create(@CurrentUser() user: JwtUser, @Body() createTicketDto: CreateTicketDto) {
    if (user.role !== UserRole.USER) {
      this.auditClient.deny(user, 'TICKET_CREATE', 'Talep yalnızca müşteri tarafından oluşturulabilir');
    }
    return this.ticketsService.createTicket(user.sub, createTicketDto);
  }

  // Talep listesi: SUPERVIZOR/ADMIN tümünü görür, TEMSILCI yalnızca kendine atananları.
  // Müşteri bu endpoint'i kullanamaz (kendi talepleri: /customer/:customerId).
  @ApiOperation({ summary: 'Talepleri listele', description: 'Yalnızca personel (TEMSILCI/SUPERVIZOR/ADMIN). TEMSILCI yalnızca kendine atananları görür.' })
  @Get()
  findAll(@CurrentUser() user: JwtUser, @Query() query: ListTicketsQueryDto) {
    if (!isStaff(user.role)) {
      this.auditClient.deny(user, 'TICKET_LIST_ALL', 'Talep listesine yalnızca personel erişebilir');
    }
    if (user.role === UserRole.TEMSILCI) {
      // Temsilci filtre ne olursa olsun sadece kendine atananları görür
      query.assignedAgentId = user.sub;
    }
    return this.ticketsService.findAll(query);
  }

  // Süpervizör dashboard'u: durum/öncelik dağılımı, SLA uyumu, memnuniyet, AI doğruluğu.
  // ':ticketNumber' rotasından önce tanımlanmalı.
  @ApiOperation({ summary: 'Süpervizör dashboard istatistikleri', description: 'Durum/öncelik/sentiment dağılımı, SLA uyum oranı, AI doğruluk oranı, memnuniyet ortalaması.' })
  @Get('stats/dashboard')
  getDashboardStats(@CurrentUser() user: JwtUser) {
    if (user.role !== UserRole.SUPERVIZOR && user.role !== UserRole.ADMIN) {
      this.auditClient.deny(user, 'DASHBOARD_VIEW', 'Dashboard yalnızca süpervizör ve admin tarafından görüntülenebilir');
    }
    return this.ticketsService.getDashboardStats();
  }

  // Takım performans tablosu: temsilci bazlı çözülen talep, ortalama puan, SLA uyumu
  @ApiOperation({ summary: 'Takım performans tablosu', description: 'Temsilci bazlı çözülen talep sayısı, ortalama çözüm süresi, ortalama müşteri puanı.' })
  @Get('stats/team')
  getTeamPerformance(@CurrentUser() user: JwtUser) {
    if (user.role !== UserRole.SUPERVIZOR && user.role !== UserRole.ADMIN) {
      this.auditClient.deny(user, 'DASHBOARD_VIEW', 'Takım performansı yalnızca süpervizör ve admin tarafından görüntülenebilir');
    }
    return this.ticketsService.getTeamPerformance();
  }

  // Tamamlanan talepler log ekranı (KAPANDI/IPTAL) — Süpervizör/Admin
  @ApiOperation({ summary: 'Tamamlanan talepler log ekranı', description: 'KAPANDI/IPTAL durumundaki talepler, kapanış zamanına göre sıralı.' })
  @ApiQuery({ name: 'take', required: false, description: 'Sayfa boyutu (varsayılan 50, maks 200)' })
  @ApiQuery({ name: 'skip', required: false })
  @Get('completed')
  getCompleted(
    @CurrentUser() user: JwtUser,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    if (user.role !== UserRole.SUPERVIZOR && user.role !== UserRole.ADMIN) {
      this.auditClient.deny(user, 'COMPLETED_TICKETS_VIEW', 'Tamamlanan talepler log ekranı yalnızca süpervizör ve admin tarafından görüntülenebilir');
    }
    return this.ticketsService.getCompletedTickets(
      take ? parseInt(take, 10) : undefined,
      skip ? parseInt(skip, 10) : undefined,
    );
  }

  // Otomatik atama akışı (AI'ın uzmanlık eşleştirmesiyle yaptığı atamalar) — Süpervizör/Admin
  @ApiOperation({ summary: 'AI otomatik atama akışı', description: 'AI tarafından otomatik atanan taleplerin geçmişi (assignmentSource=AI).' })
  @ApiQuery({ name: 'take', required: false, description: 'Varsayılan 20, maks 100' })
  @Get('auto-assignments')
  getAutoAssignments(@CurrentUser() user: JwtUser, @Query('take') take?: string) {
    if (user.role !== UserRole.SUPERVIZOR && user.role !== UserRole.ADMIN) {
      this.auditClient.deny(user, 'AUTO_ASSIGNMENTS_VIEW', 'Otomatik atama akışı yalnızca süpervizör ve admin tarafından görüntülenebilir');
    }
    return this.ticketsService.getAutoAssignments(take ? parseInt(take, 10) : undefined);
  }

  // Müşteri kendi taleplerini listeler; SUPERVIZOR/ADMIN herhangi bir müşterininkini görebilir
  @ApiOperation({ summary: 'Müşterinin taleplerini listele' })
  @ApiParam({ name: 'customerId' })
  @Get('customer/:customerId')
  findByCustomer(@CurrentUser() user: JwtUser, @Param('customerId') customerId: string) {
    const isSupervisorOrAdmin =
      user.role === UserRole.SUPERVIZOR || user.role === UserRole.ADMIN;
    if (!isSupervisorOrAdmin && user.sub !== customerId) {
      this.auditClient.deny(user, 'TICKET_LIST_CUSTOMER', 'Yalnızca kendi taleplerinizi listeleyebilirsiniz', { customerId });
    }
    return this.ticketsService.findByCustomer(customerId);
  }

  // Tek talep: müşteri kendi talebini, temsilci kendine atananı, SUPERVIZOR/ADMIN hepsini görür
  @ApiOperation({ summary: 'Tek talep getir' })
  @ApiParam({ name: 'ticketNumber', example: 'TCK-2026-000123' })
  @Get(':ticketNumber')
  async findOne(@CurrentUser() user: JwtUser, @Param('ticketNumber') ticketNumber: string) {
    const ticket = await this.ticketsService.findOne(ticketNumber);
    if (user.role === UserRole.USER && ticket.customerId !== user.sub) {
      this.auditClient.deny(user, 'TICKET_VIEW', 'Yalnızca kendi taleplerinizi görüntüleyebilirsiniz', { ticketNumber });
    }
    if (user.role === UserRole.TEMSILCI && ticket.assignedAgentId !== user.sub) {
      this.auditClient.deny(user, 'TICKET_VIEW', 'Yalnızca size atanan talepleri görüntüleyebilirsiniz', { ticketNumber });
    }
    return ticket;
  }

  // Durum değiştirme — TEMSILCI (atanan) / SUPERVIZOR (matris kontrolü serviste)
  @ApiOperation({ summary: 'Talep durumu değiştir', description: 'State machine kuralları dışı geçiş 422 döner.' })
  @ApiParam({ name: 'ticketNumber' })
  @Patch(':ticketNumber/status')
  updateStatus(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() updateDto: UpdateTicketStatusDto
  ) {
    return this.ticketsService.updateStatus(ticketNumber, updateDto, user);
  }

  // Manuel atama — yalnızca SUPERVIZOR
  @ApiOperation({ summary: 'Temsilci manuel ata', description: 'Yalnızca SUPERVIZOR. AI atamasını override eder.' })
  @ApiParam({ name: 'ticketNumber' })
  @Patch(':ticketNumber/assign')
  assign(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: AssignTicketDto,
  ) {
    if (user.role !== UserRole.SUPERVIZOR) {
      this.auditClient.deny(user, 'TICKET_ASSIGN', 'Manuel atama yalnızca süpervizör tarafından yapılabilir', { ticketNumber });
    }
    return this.ticketsService.assignTicket(ticketNumber, dto);
  }

  // Kategori değiştirme (AI override) — TEMSILCI (atanan) / SUPERVIZOR (matris kontrolü serviste)
  @ApiOperation({ summary: 'Kategori değiştir (AI override)', description: 'Değişiklik AI Service\'e bildirilir (doğruluk metriği için).' })
  @ApiParam({ name: 'ticketNumber' })
  @Patch(':ticketNumber/category')
  updateCategory(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.ticketsService.updateCategory(ticketNumber, dto, user);
  }

  // Öncelik değiştirme — yalnızca SUPERVIZOR (matris kontrolü serviste)
  @ApiOperation({ summary: 'Öncelik değiştir', description: 'Yalnızca SUPERVIZOR. Sonraki AI analizleri bu talebin önceliğini artık ezmez.' })
  @ApiParam({ name: 'ticketNumber' })
  @Patch(':ticketNumber/priority')
  updatePriority(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdatePriorityDto,
  ) {
    return this.ticketsService.updatePriority(ticketNumber, dto, user);
  }

  // Çözüm puanlama — sadece talep sahibi müşteri
  @ApiOperation({ summary: 'Çözülmüş talebi puanla', description: 'Yalnızca talep sahibi, yalnızca bir kez (1-5 yıldız).' })
  @ApiParam({ name: 'ticketNumber' })
  @Post(':ticketNumber/rating')
  rate(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RateTicketDto,
  ) {
    return this.ticketsService.rateTicket(ticketNumber, dto, user.sub);
  }

  // Mesaj gönderme — yalnızca talep sahibi müşteri ve atanan temsilci (kontrol serviste)
  @ApiOperation({ summary: 'Talebe mesaj gönder', description: 'Yalnızca talep sahibi müşteri veya atanan temsilci.' })
  @ApiParam({ name: 'ticketNumber' })
  @Post(':ticketNumber/messages')
  addMessage(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: AddMessageDto
  ) {
    return this.ticketsService.addMessage(ticketNumber, dto, user);
  }

  // Mesaj thread'i — kronolojik sırayla. Görüntüleme kuralları findOne ile aynı:
  // müşteri kendi talebini, temsilci kendine atananı, SUPERVIZOR/ADMIN hepsini görür.
  @ApiOperation({ summary: 'Mesaj thread\'ini getir', description: 'Kronolojik sırayla, gönderen + zaman damgası + içerik.' })
  @ApiParam({ name: 'ticketNumber' })
  @Get(':ticketNumber/messages')
  async getMessages(@CurrentUser() user: JwtUser, @Param('ticketNumber') ticketNumber: string) {
    const ticket = await this.ticketsService.findOne(ticketNumber);
    if (user.role === UserRole.USER && ticket.customerId !== user.sub) {
      this.auditClient.deny(user, 'TICKET_MESSAGES_VIEW', 'Yalnızca kendi taleplerinizin mesajlarını görüntüleyebilirsiniz', { ticketNumber });
    }
    if (user.role === UserRole.TEMSILCI && ticket.assignedAgentId !== user.sub) {
      this.auditClient.deny(user, 'TICKET_MESSAGES_VIEW', 'Yalnızca size atanan taleplerin mesajlarını görüntüleyebilirsiniz', { ticketNumber });
    }
    return this.ticketsService.getMessages(ticketNumber);
  }

  // --- RabbitMQ Event Listeners ---
  @EventPattern('ticket.analyzed')
  async handleTicketAnalyzed(@Payload() data: any) {
    // data payload: { ticketId, category, sentiment, priority, assignedAgentId }
    if (!data.ticketId) return;

    // updateAiAnalysis metodunu çağırıp veritabanını ve WS'i güncelle
    await this.ticketsService.updateAiAnalysis(data.ticketId, data);
  }
}
