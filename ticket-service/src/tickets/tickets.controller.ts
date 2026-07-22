import { Controller, Get, Post, Body, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
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
@Controller('api/v1/tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly auditClient: AuditClient,
  ) {}

  // Docker healthcheck için kimliksiz endpoint.
  // NestJS rotaları tanım sırasıyla eşleştirdiği için ':ticketNumber'dan önce gelmeli.
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'ticket-service' };
  }

  // Talep oluşturma — yalnızca müşteri (USER)
  @Post()
  create(@CurrentUser() user: JwtUser, @Body() createTicketDto: CreateTicketDto) {
    if (user.role !== UserRole.USER) {
      this.auditClient.deny(user, 'TICKET_CREATE', 'Talep yalnızca müşteri tarafından oluşturulabilir');
    }
    return this.ticketsService.createTicket(user.sub, createTicketDto);
  }

  // Talep listesi: SUPERVIZOR/ADMIN tümünü görür, TEMSILCI yalnızca kendine atananları.
  // Müşteri bu endpoint'i kullanamaz (kendi talepleri: /customer/:customerId).
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
  @Get('stats/dashboard')
  getDashboardStats(@CurrentUser() user: JwtUser) {
    if (user.role !== UserRole.SUPERVIZOR && user.role !== UserRole.ADMIN) {
      this.auditClient.deny(user, 'DASHBOARD_VIEW', 'Dashboard yalnızca süpervizör ve admin tarafından görüntülenebilir');
    }
    return this.ticketsService.getDashboardStats();
  }

  // Takım performans tablosu: temsilci bazlı çözülen talep, ortalama puan, SLA uyumu
  @Get('stats/team')
  getTeamPerformance(@CurrentUser() user: JwtUser) {
    if (user.role !== UserRole.SUPERVIZOR && user.role !== UserRole.ADMIN) {
      this.auditClient.deny(user, 'DASHBOARD_VIEW', 'Takım performansı yalnızca süpervizör ve admin tarafından görüntülenebilir');
    }
    return this.ticketsService.getTeamPerformance();
  }

  // Müşteri kendi taleplerini listeler; SUPERVIZOR/ADMIN herhangi bir müşterininkini görebilir
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
  @Patch(':ticketNumber/status')
  updateStatus(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() updateDto: UpdateTicketStatusDto
  ) {
    return this.ticketsService.updateStatus(ticketNumber, updateDto, user);
  }

  // Manuel atama — yalnızca SUPERVIZOR
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
  @Patch(':ticketNumber/category')
  updateCategory(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.ticketsService.updateCategory(ticketNumber, dto, user);
  }

  // Öncelik değiştirme — yalnızca SUPERVIZOR (matris kontrolü serviste)
  @Patch(':ticketNumber/priority')
  updatePriority(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdatePriorityDto,
  ) {
    return this.ticketsService.updatePriority(ticketNumber, dto, user);
  }

  // Çözüm puanlama — sadece talep sahibi müşteri
  @Post(':ticketNumber/rating')
  rate(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: RateTicketDto,
  ) {
    return this.ticketsService.rateTicket(ticketNumber, dto, user.sub);
  }

  // Mesaj gönderme — yalnızca talep sahibi müşteri ve atanan temsilci (kontrol serviste)
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
