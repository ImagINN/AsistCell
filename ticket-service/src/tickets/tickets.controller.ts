import { Controller, Get, Post, Body, Param, Patch, Headers } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { MessageRole } from '../common/enums';

@Controller('api/v1/tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(@Headers('x-user-id') userId: string, @Body() createTicketDto: CreateTicketDto) {
    // Gerçekte x-user-id header'ı Kong JWT plugin üzerinden (veya custom auth) gelebilir.
    // Şimdilik test amaçlı header'dan alıyoruz veya auth modülü ekleyip @GetUser decorator'ü kullanabilirsiniz.
    return this.ticketsService.createTicket(userId || 'customer-123', createTicketDto);
  }

  @Get()
  findAll() {
    return this.ticketsService.findAll();
  }

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.ticketsService.findByCustomer(customerId);
  }

  @Get(':ticketNumber')
  findOne(@Param('ticketNumber') ticketNumber: string) {
    return this.ticketsService.findOne(ticketNumber);
  }

  @Patch(':ticketNumber/status')
  updateStatus(
    @Param('ticketNumber') ticketNumber: string, 
    @Headers('x-user-role') role: string, // TEMSILCI, ADMIN vs
    @Body() updateDto: UpdateTicketStatusDto
  ) {
    return this.ticketsService.updateStatus(ticketNumber, updateDto, role || 'TEMSILCI');
  }

  @Post(':ticketNumber/messages')
  addMessage(
    @Param('ticketNumber') ticketNumber: string,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-role') userRole: string,
    @Body() dto: AddMessageDto
  ) {
    const roleEnum = (userRole as MessageRole) || MessageRole.MUSTERI;
    return this.ticketsService.addMessage(ticketNumber, dto, userId || 'user-123', roleEnum);
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

