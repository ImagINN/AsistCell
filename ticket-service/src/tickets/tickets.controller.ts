import { Controller, Get, Post, Body, Param, Patch, UseGuards, ForbiddenException } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { MessageRole, isStaff } from '../common/enums';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

// Kimlik bilgisi client header'larından değil, doğrulanmış JWT payload'ından gelir.
@Controller('api/v1/tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // Docker healthcheck için kimliksiz endpoint.
  // NestJS rotaları tanım sırasıyla eşleştirdiği için ':ticketNumber'dan önce gelmeli.
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'ticket-service' };
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() createTicketDto: CreateTicketDto) {
    return this.ticketsService.createTicket(user.sub, createTicketDto);
  }

  // Tüm talepler — sadece personel
  @Get()
  findAll(@CurrentUser() user: JwtUser) {
    if (!isStaff(user.role)) {
      throw new ForbiddenException('Only staff can list all tickets');
    }
    return this.ticketsService.findAll();
  }

  // Müşteri sadece kendi taleplerini listeleyebilir
  @Get('customer/:customerId')
  findByCustomer(@CurrentUser() user: JwtUser, @Param('customerId') customerId: string) {
    if (!isStaff(user.role) && user.sub !== customerId) {
      throw new ForbiddenException('You can only list your own tickets');
    }
    return this.ticketsService.findByCustomer(customerId);
  }

  @Get(':ticketNumber')
  async findOne(@CurrentUser() user: JwtUser, @Param('ticketNumber') ticketNumber: string) {
    const ticket = await this.ticketsService.findOne(ticketNumber);
    if (!isStaff(user.role) && ticket.customerId !== user.sub) {
      throw new ForbiddenException('You can only view your own tickets');
    }
    return ticket;
  }

  @Patch(':ticketNumber/status')
  updateStatus(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() updateDto: UpdateTicketStatusDto
  ) {
    return this.ticketsService.updateStatus(ticketNumber, updateDto, user.role, user.sub);
  }

  @Post(':ticketNumber/messages')
  addMessage(
    @Param('ticketNumber') ticketNumber: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: AddMessageDto
  ) {
    const senderRole = isStaff(user.role) ? MessageRole.TEMSILCI : MessageRole.MUSTERI;
    return this.ticketsService.addMessage(ticketNumber, dto, user.sub, senderRole);
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
