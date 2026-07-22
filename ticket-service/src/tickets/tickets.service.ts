import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ClientProxy } from '@nestjs/microservices';
import { Ticket, Message } from './schemas/ticket.schema';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { RateTicketDto } from './dto/rate-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { TicketStatus, MessageRole, TicketPriority, isStaff } from '../common/enums';
import { StateMachineException } from '../common/exceptions/state-machine.exception';
import { TicketsGateway } from './tickets.gateway';

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<Ticket>,
    private ticketsGateway: TicketsGateway,
    @Inject('AI_SERVICE') private aiClient: ClientProxy,
    @Inject('GAMIFICATION_SERVICE') private gamificationClient: ClientProxy,
  ) {}

  // ================= State Machine =================
  // Personel (TEMSILCI/SUPERVIZOR/ADMIN) geçişleri ile müşteri geçişleri ayrılır.
  private isValidStatusTransition(current: TicketStatus, target: TicketStatus, role: string): boolean {
    const staff = isStaff(role);

    // Opsiyonel: Her durumdan IPTAL edilebilir (Müşteri kendi talebini, personel her talebi)
    if (target === TicketStatus.IPTAL) return true;

    // Geri kalan tüm geçişler personel yetkisi gerektirir
    if (!staff) {
      // Müşteri yalnızca MUSTERI_BEKLENIYOR -> ISLEMDE tetikleyebilir (yanıt verdiğinde)
      return current === TicketStatus.MUSTERI_BEKLENIYOR && target === TicketStatus.ISLEMDE;
    }

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

    return false;
  }

  // ================= Ticket Number (sıralı, çakışmasız) =================
  private async nextTicketNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const counters = this.ticketModel.db.collection('ticket_counters');
    const result = await counters.findOneAndUpdate(
      { _id: `TCK-${year}` as any },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    const seq: number = (result as any)?.seq ?? (result as any)?.value?.seq ?? 1;
    return `TCK-${year}-${seq.toString().padStart(6, '0')}`;
  }

  // ================= CRUD =================
  async createTicket(customerId: string, createDto: CreateTicketDto): Promise<Ticket> {
    const ticket = new this.ticketModel({
      ...createDto,
      customerId,
      status: TicketStatus.YENI,
      ticketNumber: await this.nextTicketNumber(),
    });

    const savedTicket = await ticket.save();

    // WS Bildirimi
    this.ticketsGateway.notifyTicketCreated(customerId, savedTicket);

    // RabbitMQ üzerinden AI servisine asenkron analiz eventi gönder
    this.aiClient.emit('ticket.created', {
      ticketId: savedTicket.ticketNumber,
      title: savedTicket.title,
      description: savedTicket.description
    });

    return savedTicket;
  }

  async findAll(query: ListTicketsQueryDto = {}): Promise<Ticket[]> {
    const filter: Record<string, any> = {};
    if (query.assignedAgentId) filter.assignedAgentId = query.assignedAgentId;
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    return this.ticketModel.find(filter).sort({ createdAt: -1 }).exec();
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

  async updateStatus(
    ticketNumber: string,
    updateDto: UpdateTicketStatusDto,
    role: string,
    userId: string,
  ): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);

    // Müşteri yalnızca kendi talebini iptal edebilir / güncelleyebilir
    if (!isStaff(role) && ticket.customerId !== userId) {
      throw new ForbiddenException('You can only modify your own tickets');
    }

    if (!this.isValidStatusTransition(ticket.status, updateDto.status, role)) {
      throw new StateMachineException(ticket.status, updateDto.status);
    }

    const previousStatus = ticket.status;
    ticket.status = updateDto.status;

    if (updateDto.status === TicketStatus.COZULDU) {
      ticket.resolvedAt = new Date();
      if (updateDto.resolutionNote) {
        ticket.resolutionNote = updateDto.resolutionNote;
      }
    }

    const updated = await ticket.save();

    // Çözüm/iptal eventleri (gamification puanı + AI kapasite düşümü)
    this.emitLifecycleEvents(updated, previousStatus);

    // WS Bildirimi
    this.ticketsGateway.notifyTicketStatusUpdated(ticket.customerId, updated);

    return updated;
  }

  // COZULDU -> gamification'a puan eventi + AI'a kapasite bırakma eventi
  // IPTAL   -> yalnızca AI'a kapasite bırakma eventi
  private emitLifecycleEvents(ticket: Ticket, previousStatus: TicketStatus): void {
    if (!ticket.assignedAgentId) return;

    if (ticket.status === TicketStatus.COZULDU) {
      const slaMet = ticket.slaDeadline ? new Date() <= ticket.slaDeadline : true;

      this.gamificationClient.emit('ticket.resolved', {
        ticketId: ticket.ticketNumber,
        agentId: ticket.assignedAgentId,
        slaMet,
      });

      this.aiClient.emit('ticket.released', {
        ticketId: ticket.ticketNumber,
        agentId: ticket.assignedAgentId,
        resolved: true,
      });
    } else if (
      ticket.status === TicketStatus.IPTAL &&
      previousStatus !== TicketStatus.COZULDU &&
      previousStatus !== TicketStatus.YENI
    ) {
      this.aiClient.emit('ticket.released', {
        ticketId: ticket.ticketNumber,
        agentId: ticket.assignedAgentId,
        resolved: false,
      });
    }
  }

  // ================= Puanlama =================
  // Yalnızca talep sahibi, yalnızca COZULDU durumunda ve bir kez puan verebilir.
  async rateTicket(ticketNumber: string, dto: RateTicketDto, userId: string): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);

    if (ticket.customerId !== userId) {
      throw new ForbiddenException('You can only rate your own tickets');
    }
    if (ticket.status !== TicketStatus.COZULDU) {
      throw new ForbiddenException('Only resolved tickets can be rated');
    }
    if (ticket.rating) {
      throw new ForbiddenException('This ticket has already been rated');
    }

    ticket.rating = dto.rating;
    if (dto.comment) ticket.ratingComment = dto.comment;
    ticket.ratedAt = new Date();

    const updated = await ticket.save();

    // Gamification'a müşteri memnuniyet eventi
    if (ticket.assignedAgentId) {
      this.gamificationClient.emit('ticket.rated', {
        ticketId: ticket.ticketNumber,
        agentId: ticket.assignedAgentId,
        rating: dto.rating,
      });
    }

    this.ticketsGateway.notifyTicketStatusUpdated(ticket.customerId, updated);

    return updated;
  }

  // ================= Manuel Atama (Süpervizör/Admin) =================
  async assignTicket(ticketNumber: string, dto: AssignTicketDto): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);

    if (ticket.status === TicketStatus.COZULDU || ticket.status === TicketStatus.IPTAL) {
      throw new ForbiddenException('Closed tickets cannot be assigned');
    }

    // AI'ın yaptığı atama manuel değiştiriliyorsa doğruluk metriği için işaretle
    if (
      ticket.assignmentSource === 'AI' &&
      ticket.assignedAgentId &&
      ticket.assignedAgentId !== dto.agentId
    ) {
      ticket.reassignedAfterAi = true;
    }

    ticket.assignedAgentId = dto.agentId;
    ticket.assignmentSource = 'MANUAL';
    if (ticket.status === TicketStatus.YENI) {
      ticket.status = TicketStatus.ATANDI;
    }

    const updated = await ticket.save();

    this.ticketsGateway.notifyTicketStatusUpdated(ticket.customerId, updated);

    return updated;
  }

  // ================= Dashboard İstatistikleri (Süpervizör/Admin) =================
  async getDashboardStats() {
    const [byStatus, byPriority, slaAgg, ratingAgg, aiAgg] = await Promise.all([
      this.ticketModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.ticketModel.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      // SLA uyumu: çözülen taleplerde resolvedAt <= slaDeadline oranı
      this.ticketModel.aggregate([
        { $match: { status: TicketStatus.COZULDU, slaDeadline: { $ne: null } } },
        {
          $group: {
            _id: null,
            resolved: { $sum: 1 },
            slaMet: {
              $sum: {
                $cond: [
                  { $lte: [{ $ifNull: ['$resolvedAt', '$updatedAt'] }, '$slaDeadline'] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      this.ticketModel.aggregate([
        { $match: { rating: { $ne: null } } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, ratedCount: { $sum: 1 } } },
      ]),
      // AI doğruluğu: AI'ın atadığı taleplerin ne kadarı manuel değiştirilmedi
      this.ticketModel.aggregate([
        { $match: { aiProcessed: true } },
        {
          $group: {
            _id: null,
            analyzed: { $sum: 1 },
            reassigned: { $sum: { $cond: ['$reassignedAfterAi', 1, 0] } },
          },
        },
      ]),
    ]);

    const statusCounts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    const priorityCounts = Object.fromEntries(byPriority.map((p) => [p._id, p.count]));
    const total = byStatus.reduce((sum, s) => sum + s.count, 0);
    const open =
      total - (statusCounts[TicketStatus.COZULDU] ?? 0) - (statusCounts[TicketStatus.IPTAL] ?? 0);

    const sla = slaAgg[0];
    const rating = ratingAgg[0];
    const ai = aiAgg[0];

    return {
      totals: { total, open, byStatus: statusCounts, byPriority: priorityCounts },
      sla: {
        resolvedWithSla: sla?.resolved ?? 0,
        slaMet: sla?.slaMet ?? 0,
        complianceRate: sla?.resolved ? sla.slaMet / sla.resolved : null,
      },
      satisfaction: {
        avgRating: rating?.avgRating ?? null,
        ratedCount: rating?.ratedCount ?? 0,
      },
      ai: {
        analyzedCount: ai?.analyzed ?? 0,
        reassignedCount: ai?.reassigned ?? 0,
        accuracyRate: ai?.analyzed ? 1 - ai.reassigned / ai.analyzed : null,
      },
    };
  }

  async addMessage(ticketNumber: string, dto: AddMessageDto, senderId: string, senderRole: MessageRole): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);

    // Müşteri yalnızca kendi talebine mesaj yazabilir
    if (senderRole === MessageRole.MUSTERI && ticket.customerId !== senderId) {
      throw new ForbiddenException('You can only message your own tickets');
    }

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

    ticket.aiProcessed = true;

    // Analiz geç geldiyse ve talep bu arada kapandıysa hiçbir alanı ezme —
    // aksi halde çözülmüş/iptal edilmiş talep tekrar ATANDI'ya döner.
    if (ticket.status === TicketStatus.COZULDU || ticket.status === TicketStatus.IPTAL) {
      return ticket.save();
    }

    ticket.category = analysisData.category;
    ticket.priority = analysisData.priority;

    // AI yalnızca henüz atanmamış talepleri atayabilir; manuel atama (süpervizör)
    // her zaman önceliklidir ve geç gelen analizle geri alınmaz.
    if (analysisData.assignedAgentId && !ticket.assignedAgentId) {
       ticket.assignedAgentId = analysisData.assignedAgentId;
       ticket.assignmentSource = 'AI';
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
