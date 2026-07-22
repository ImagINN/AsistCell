import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ClientProxy } from '@nestjs/microservices';
import { Ticket, Message } from './schemas/ticket.schema';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { TicketStatus, MessageRole, TicketPriority } from '../common/enums';
import { StateMachineException } from '../common/exceptions/state-machine.exception';
import { TicketsGateway } from './tickets.gateway';

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<Ticket>,
    private ticketsGateway: TicketsGateway,
    @Inject('AI_SERVICE') private client: ClientProxy,
  ) {}

  // ================= State Machine =================
  private isValidStatusTransition(current: TicketStatus, target: TicketStatus, role: string): boolean {
    // 1. YENI -> ATANDI (Sistem/Supervizor)
    if (current === TicketStatus.YENI && target === TicketStatus.ATANDI) return true;
    
    // 2. ATANDI -> ISLEMDE (Temsilci)
    if (current === TicketStatus.ATANDI && target === TicketStatus.ISLEMDE) return true;

    // 3. ISLEMDE -> MUSTERI_BEKLENIYOR (Temsilci)
    if (current === TicketStatus.ISLEMDE && target === TicketStatus.MUSTERI_BEKLENIYOR) return true;

    // 4. MUSTERI_BEKLENIYOR -> ISLEMDE (Sistem/Müşteri)
    if (current === TicketStatus.MUSTERI_BEKLENIYOR && target === TicketStatus.ISLEMDE) return true;

    // 5. ISLEMDE -> COZULDU (Temsilci)
    if (current === TicketStatus.ISLEMDE && target === TicketStatus.COZULDU) return true;

    // Opsiyonel: Her durumdan IPTAL edilebilir (Müşteri)
    if (target === TicketStatus.IPTAL) return true;

    return false;
  }

  // ================= CRUD =================
  async createTicket(customerId: string, createDto: CreateTicketDto): Promise<Ticket> {
    const ticket = new this.ticketModel({
      ...createDto,
      customerId,
      status: TicketStatus.YENI,
    });
    
    const savedTicket = await ticket.save();

    // WS Bildirimi
    this.ticketsGateway.notifyTicketCreated(customerId, savedTicket);

    // RabbitMQ üzerinden AI servisine asenkron analiz eventi gönder
    this.client.emit('ticket.created', {
      ticketId: savedTicket.ticketNumber,
      title: savedTicket.title,
      description: savedTicket.description
    });

    return savedTicket;
  }

  async findAll(): Promise<Ticket[]> {
    return this.ticketModel.find().sort({ createdAt: -1 }).exec();
  }

  async findByCustomer(customerId: string): Promise<Ticket[]> {
    return this.ticketModel.find({ customerId }).sort({ createdAt: -1 }).exec();
  }

  async findOne(ticketNumber: string): Promise<Ticket> {
    const ticket = await this.ticketModel.findOne({ ticketNumber }).exec();
    if (!ticket) {
      throw new NotFoundException(`Ticket ${ticketNumber} not found`);
    }
    return ticket;
  }

  async updateStatus(ticketNumber: string, updateDto: UpdateTicketStatusDto, role: string): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);

    if (!this.isValidStatusTransition(ticket.status, updateDto.status, role)) {
      throw new StateMachineException(ticket.status, updateDto.status);
    }

    ticket.status = updateDto.status;
    
    if (updateDto.status === TicketStatus.COZULDU && updateDto.resolutionNote) {
      ticket.resolutionNote = updateDto.resolutionNote;
    }

    const updated = await ticket.save();
    
    // WS Bildirimi
    this.ticketsGateway.notifyTicketStatusUpdated(ticket.customerId, updated);
    
    return updated;
  }

  async addMessage(ticketNumber: string, dto: AddMessageDto, senderId: string, senderRole: MessageRole): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);
    
    const newMessage = {
      senderId,
      senderRole,
      content: dto.content,
      createdAt: new Date(),
    };

    ticket.messages.push(newMessage as Message);

    // State Machine Otomatik Geçişleri
    if (senderRole === MessageRole.MUSTERI && ticket.status === TicketStatus.MUSTERI_BEKLENIYOR) {
      ticket.status = TicketStatus.ISLEMDE;
    } else if (senderRole === MessageRole.TEMSILCI && ticket.status === TicketStatus.ISLEMDE) {
      ticket.status = TicketStatus.MUSTERI_BEKLENIYOR;
    }

    const updated = await ticket.save();

    // WS Bildirimi
    this.ticketsGateway.notifyNewMessage(updated, newMessage);

    return updated;
  }

  // Sadece AI Service (veya RabbitMQ consumer) tarafından çağrılır
  async updateAiAnalysis(ticketNumber: string, analysisData: any): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);
    
    ticket.category = analysisData.category;
    ticket.priority = analysisData.priority;
    
    if (analysisData.assignedAgentId) {
       ticket.assignedAgentId = analysisData.assignedAgentId;
       ticket.status = TicketStatus.ATANDI; // State transition
    }

    // Recalculate SLA based on new priority
    let hours = 24; 
    switch (ticket.priority) {
      case TicketPriority.KRITIK: hours = 1; break;
      case TicketPriority.YUKSEK: hours = 4; break;
      case TicketPriority.ORTA: hours = 24; break;
      case TicketPriority.DUSUK: hours = 72; break;
    }
    const deadline = new Date((ticket as any).createdAt || Date.now());
    deadline.setHours(deadline.getHours() + hours);
    ticket.slaDeadline = deadline;

    const updated = await ticket.save();
    
    this.ticketsGateway.notifyTicketStatusUpdated(ticket.customerId, updated);
    
    return updated;
  }
}
