import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
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
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { TicketStatus, MessageRole, TicketPriority, UserRole, isStaff } from '../common/enums';
import { StateMachineException } from '../common/exceptions/state-machine.exception';
import { TicketsGateway } from './tickets.gateway';
import { AuditClient } from '../common/audit.client';
import { JwtUser } from '../common/guards/jwt-auth.guard';

@Injectable()
export class TicketsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketsService.name);
  // COZULDU sonrası müşteri onayı gelmezse sistemin otomatik kapatma süresi
  private readonly AUTO_CLOSE_HOURS = Number(process.env.TICKET_AUTO_CLOSE_HOURS ?? 48);
  private autoCloseTimer?: NodeJS.Timeout;

  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<Ticket>,
    private ticketsGateway: TicketsGateway,
    private auditClient: AuditClient,
    @Inject('AI_SERVICE') private aiClient: ClientProxy,
    @Inject('GAMIFICATION_SERVICE') private gamificationClient: ClientProxy,
  ) {}

  // ================= Otomatik Kapanış (Spec 4.2: COZULDU -> KAPANDI, Sistem, 48 saat) =================
  onModuleInit() {
    this.autoCloseTimer = setInterval(
      () => this.autoCloseResolvedTickets().catch((err) => this.logger.error(`Auto-close failed: ${err.message}`)),
      60_000,
    );
  }

  onModuleDestroy() {
    if (this.autoCloseTimer) clearInterval(this.autoCloseTimer);
  }

  async autoCloseResolvedTickets(): Promise<void> {
    const cutoff = new Date(Date.now() - this.AUTO_CLOSE_HOURS * 60 * 60 * 1000);
    const staleTickets = await this.ticketModel
      .find({ status: TicketStatus.COZULDU, resolvedAt: { $lte: cutoff } })
      .exec();

    for (const ticket of staleTickets) {
      ticket.status = TicketStatus.KAPANDI;
      ticket.closedAt = new Date();
      const updated = await ticket.save();
      this.logger.log(`Ticket ${ticket.ticketNumber} auto-closed after ${this.AUTO_CLOSE_HOURS}h`);
      this.ticketsGateway.notifyTicketStatusUpdated(ticket.customerId, updated);
    }
  }

  // ================= State Machine (Spec 4.2) =================
  // İzinli geçişler ve kimin yapabileceği. Tabloda olmayan her geçiş 422 döner;
  // geçiş tabloda olup aktör yanlışsa 403 + audit döner.
  // MUSTERI_BEKLENIYOR -> ISLEMDE yalnızca Sistem'dir (müşteri mesaj yazınca
  // otomatik tetiklenir, addMessage içinde); COZULDU -> KAPANDI müşteri onayı
  // veya 48 saat sonunda otomatik kapanışla (autoCloseResolvedTickets) olur.
  private static readonly TRANSITIONS: {
    from: TicketStatus;
    to: TicketStatus;
    actors: Array<'SUPERVIZOR' | 'TEMSILCI' | 'MUSTERI' | 'SISTEM'>;
  }[] = [
    { from: TicketStatus.YENI, to: TicketStatus.ATANDI, actors: ['SUPERVIZOR', 'SISTEM'] },
    { from: TicketStatus.ATANDI, to: TicketStatus.ISLEMDE, actors: ['TEMSILCI'] },
    { from: TicketStatus.ISLEMDE, to: TicketStatus.MUSTERI_BEKLENIYOR, actors: ['TEMSILCI'] },
    { from: TicketStatus.MUSTERI_BEKLENIYOR, to: TicketStatus.ISLEMDE, actors: ['SISTEM'] },
    { from: TicketStatus.ISLEMDE, to: TicketStatus.COZULDU, actors: ['TEMSILCI'] },
    { from: TicketStatus.COZULDU, to: TicketStatus.KAPANDI, actors: ['MUSTERI', 'SISTEM'] },
    { from: TicketStatus.COZULDU, to: TicketStatus.ISLEMDE, actors: ['MUSTERI'] },
  ];

  private findTransitionRule(from: TicketStatus, to: TicketStatus) {
    return TicketsService.TRANSITIONS.find((r) => r.from === from && r.to === to);
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
    user: JwtUser,
  ): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);
    const target = updateDto.status;

    // 1) Geçiş spec tablosunda var mı? Yoksa 422.
    const rule = this.findTransitionRule(ticket.status, target);
    if (!rule) {
      throw new StateMachineException(ticket.status, target);
    }

    // 2) Aktör kontrolü (geçiş bazında). Yanlış aktör: 403 + audit.
    if (user.role === UserRole.USER) {
      if (!rule.actors.includes('MUSTERI')) {
        this.auditClient.deny(user, 'TICKET_STATUS_UPDATE', 'Bu durum geçişini müşteri yapamaz', { ticketNumber, from: ticket.status, to: target });
      }
      if (ticket.customerId !== user.sub) {
        this.auditClient.deny(user, 'TICKET_STATUS_UPDATE', 'Yalnızca kendi talebiniz üzerinde işlem yapabilirsiniz', { ticketNumber });
      }
    } else if (user.role === UserRole.TEMSILCI) {
      if (!rule.actors.includes('TEMSILCI')) {
        this.auditClient.deny(user, 'TICKET_STATUS_UPDATE', 'Bu durum geçişini temsilci yapamaz', { ticketNumber, from: ticket.status, to: target });
      }
      if (ticket.assignedAgentId !== user.sub) {
        this.auditClient.deny(user, 'TICKET_STATUS_UPDATE', 'Yalnızca size atanan taleplerin durumunu değiştirebilirsiniz', { ticketNumber });
      }
    } else if (user.role === UserRole.SUPERVIZOR) {
      if (!rule.actors.includes('SUPERVIZOR')) {
        this.auditClient.deny(user, 'TICKET_STATUS_UPDATE', 'Bu durum geçişini süpervizör yapamaz', { ticketNumber, from: ticket.status, to: target });
      }
    } else {
      // ADMIN: yetki matrisi gereği durum değiştiremez
      this.auditClient.deny(user, 'TICKET_STATUS_UPDATE', 'Talep durumunu yalnızca temsilci, süpervizör veya müşteri (onay/red) değiştirebilir', { ticketNumber });
    }

    // 3) Geçiş koşulları (koşul ihlali de kural dışı geçiş sayılır: 422)
    if (target === TicketStatus.ATANDI && !ticket.assignedAgentId) {
      throw new UnprocessableEntityException('ATANDI durumuna geçiş için önce temsilci belirlenmelidir');
    }
    if (target === TicketStatus.COZULDU && !updateDto.resolutionNote?.trim()) {
      throw new UnprocessableEntityException('Çözüm notu zorunludur');
    }

    const previousStatus = ticket.status;
    ticket.status = target;

    if (target === TicketStatus.COZULDU) {
      ticket.resolvedAt = new Date();
      ticket.resolutionNote = updateDto.resolutionNote;
    }
    if (target === TicketStatus.KAPANDI) {
      ticket.closedAt = new Date();
    }

    const updated = await ticket.save();

    // Kritik durum değişiklikleri (çözüm/kapanış/iptal) merkezi audit log'a yazılır
    if (
      updated.status === TicketStatus.COZULDU ||
      updated.status === TicketStatus.KAPANDI ||
      updated.status === TicketStatus.IPTAL
    ) {
      this.auditClient.logEvent(user, 'TICKET_STATUS_CHANGED', updated.ticketNumber, {
        from: previousStatus,
        to: updated.status,
      });
    }

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
  // Yalnızca talep sahibi, yalnızca COZULDU/KAPANDI durumunda ve bir kez puan verebilir.
  async rateTicket(ticketNumber: string, dto: RateTicketDto, userId: string): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);

    if (ticket.customerId !== userId) {
      throw new ForbiddenException('You can only rate your own tickets');
    }
    if (ticket.status !== TicketStatus.COZULDU && ticket.status !== TicketStatus.KAPANDI) {
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

    if (
      ticket.status === TicketStatus.COZULDU ||
      ticket.status === TicketStatus.KAPANDI ||
      ticket.status === TicketStatus.IPTAL
    ) {
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

  // ================= Kategori Değiştirme / AI Override (Temsilci-atanan, Süpervizör) =================
  async updateCategory(ticketNumber: string, dto: UpdateCategoryDto, user: JwtUser): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);

    if (user.role !== UserRole.TEMSILCI && user.role !== UserRole.SUPERVIZOR) {
      this.auditClient.deny(user, 'TICKET_CATEGORY_UPDATE', 'Kategoriyi yalnızca temsilci veya süpervizör değiştirebilir', { ticketNumber });
    }
    if (user.role === UserRole.TEMSILCI && ticket.assignedAgentId !== user.sub) {
      this.auditClient.deny(user, 'TICKET_CATEGORY_UPDATE', 'Yalnızca size atanan taleplerin kategorisini değiştirebilirsiniz', { ticketNumber });
    }
    if (
      ticket.status === TicketStatus.COZULDU ||
      ticket.status === TicketStatus.KAPANDI ||
      ticket.status === TicketStatus.IPTAL
    ) {
      throw new ForbiddenException('Kapatılmış taleplerin kategorisi değiştirilemez');
    }

    // AI'ın atadığı kategori değiştiriliyorsa doğruluk metriğine yansıt
    if (ticket.aiProcessed && ticket.aiCategory && dto.category !== ticket.aiCategory) {
      ticket.categoryOverriddenAfterAi = true;
    }
    ticket.category = dto.category;

    const updated = await ticket.save();

    // Kategori değişikliği AI Service'e bildirilir (doğruluk metriği)
    this.aiClient.emit('ticket.category_changed', {
      ticketId: updated.ticketNumber,
      aiCategory: updated.aiCategory ?? null,
      newCategory: updated.category,
      changedByRole: user.role,
    });

    this.ticketsGateway.notifyTicketStatusUpdated(ticket.customerId, updated);
    return updated;
  }

  // Öncelik başına SLA süresi (saat) — spec 4.4
  private static readonly SLA_HOURS: Record<TicketPriority, number> = {
    [TicketPriority.KRITIK]: 1,
    [TicketPriority.YUKSEK]: 4,
    [TicketPriority.ORTA]: 24,
    [TicketPriority.DUSUK]: 72,
  };

  // SLA süresi talep oluşturma anından itibaren sayılır
  private slaDeadlineFor(ticket: Ticket): Date {
    const hours = TicketsService.SLA_HOURS[ticket.priority as TicketPriority] ?? 24;
    const deadline = new Date((ticket as any).createdAt ?? Date.now());
    deadline.setHours(deadline.getHours() + hours);
    return deadline;
  }

  // ================= Öncelik Değiştirme (Süpervizör) =================
  async updatePriority(ticketNumber: string, dto: UpdatePriorityDto, user: JwtUser): Promise<Ticket> {
    const ticket = await this.findOne(ticketNumber);

    if (user.role !== UserRole.SUPERVIZOR) {
      this.auditClient.deny(user, 'TICKET_PRIORITY_UPDATE', 'Önceliği yalnızca süpervizör değiştirebilir', { ticketNumber });
    }
    if (ticket.status === TicketStatus.COZULDU || ticket.status === TicketStatus.IPTAL) {
      throw new ForbiddenException('Kapatılmış taleplerin önceliği değiştirilemez');
    }

    ticket.priority = dto.priority;
    ticket.priorityManuallySet = true;
    ticket.slaDeadline = this.slaDeadlineFor(ticket);

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
        { $match: { status: { $in: [TicketStatus.COZULDU, TicketStatus.KAPANDI] }, resolvedAt: { $ne: null }, slaDeadline: { $ne: null } } },
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
      // AI doğruluğu: AI analizlerinin ne kadarı manuel düzeltilmedi
      // (atama değişikliği veya kategori override'ı = AI hatası sayılır)
      this.ticketModel.aggregate([
        { $match: { aiProcessed: true } },
        {
          $group: {
            _id: null,
            analyzed: { $sum: 1 },
            reassigned: { $sum: { $cond: ['$reassignedAfterAi', 1, 0] } },
            categoryOverridden: { $sum: { $cond: ['$categoryOverriddenAfterAi', 1, 0] } },
            misses: {
              $sum: {
                $cond: [
                  { $or: ['$reassignedAfterAi', '$categoryOverriddenAfterAi'] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const statusCounts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    const priorityCounts = Object.fromEntries(byPriority.map((p) => [p._id, p.count]));
    const total = byStatus.reduce((sum, s) => sum + s.count, 0);
    const open =
      total -
      (statusCounts[TicketStatus.COZULDU] ?? 0) -
      (statusCounts[TicketStatus.KAPANDI] ?? 0) -
      (statusCounts[TicketStatus.IPTAL] ?? 0);

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
        categoryOverriddenCount: ai?.categoryOverridden ?? 0,
        accuracyRate: ai?.analyzed ? 1 - ai.misses / ai.analyzed : null,
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
    if (
      ticket.status === TicketStatus.COZULDU ||
      ticket.status === TicketStatus.KAPANDI ||
      ticket.status === TicketStatus.IPTAL
    ) {
      return ticket.save();
    }

    ticket.aiCategory = analysisData.category;
    // Personel analizden önce kategori atadıysa (BELIRSIZ dışı) AI onu ezmez;
    // seçim AI önerisinden farklıysa doğruluk metriğine yansıtılır.
    if (ticket.category === 'BELIRSIZ') {
      ticket.category = analysisData.category;
    } else if (ticket.category !== analysisData.category) {
      ticket.categoryOverriddenAfterAi = true;
    }
    // Süpervizör önceliği manuel belirlediyse AI önerisi onu ezmez
    if (!ticket.priorityManuallySet) {
      ticket.priority = analysisData.priority;
    }

    // AI yalnızca henüz atanmamış talepleri atayabilir; manuel atama (süpervizör)
    // her zaman önceliklidir ve geç gelen analizle geri alınmaz.
    if (analysisData.assignedAgentId && !ticket.assignedAgentId) {
       ticket.assignedAgentId = analysisData.assignedAgentId;
       ticket.assignmentSource = 'AI';
       ticket.status = TicketStatus.ATANDI; // State transition
    }

    // Recalculate SLA based on new priority
    ticket.slaDeadline = this.slaDeadlineFor(ticket);

    const updated = await ticket.save();

    this.ticketsGateway.notifyTicketStatusUpdated(ticket.customerId, updated);

    return updated;
  }
}
