import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';
import { TicketStatus, TicketPriority, MessageRole } from '../../common/enums';

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: String, required: true })
  senderId: string;

  @Prop({ type: String, enum: MessageRole, required: true })
  senderRole: MessageRole;

  @Prop({ type: String, required: true })
  content: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}
export const MessageSchema = SchemaFactory.createForClass(Message);

@Schema({ timestamps: true })
export class Ticket extends Document {
  @Prop({ type: String, unique: true, index: true })
  ticketNumber: string;

  @Prop({ type: String, required: true, minlength: 5, maxlength: 100 })
  title: string;

  @Prop({ type: String, required: true, minlength: 20 })
  description: string;

  @Prop({ type: String, enum: TicketStatus, default: TicketStatus.YENI })
  status: TicketStatus;

  @Prop({ type: String, enum: TicketPriority, default: TicketPriority.ORTA })
  priority: TicketPriority;

  @Prop({ type: String, default: 'BELIRSIZ' })
  category: string;

  @Prop({ type: String, required: true, index: true })
  customerId: string;

  @Prop({ type: String, index: true })
  assignedAgentId?: string;

  @Prop({ type: [MessageSchema], default: [] })
  messages: Message[];

  @Prop({ type: Date })
  slaDeadline?: Date;

  @Prop({ type: String })
  resolutionNote?: string;

  @Prop({ type: Date })
  resolvedAt?: Date;

  // Müşteri memnuniyet puanı (1-5), yalnızca COZULDU sonrası bir kez verilebilir
  @Prop({ type: Number, min: 1, max: 5 })
  rating?: number;

  @Prop({ type: String, maxlength: 500 })
  ratingComment?: string;

  @Prop({ type: Date })
  ratedAt?: Date;

  // AI doğruluk takibi: analiz yapıldı mı, atama kaynağı ne, AI ataması manuel değiştirildi mi
  @Prop({ type: Boolean, default: false })
  aiProcessed: boolean;

  @Prop({ type: String, enum: ['AI', 'MANUAL'] })
  assignmentSource?: string;

  @Prop({ type: Boolean, default: false })
  reassignedAfterAi: boolean;
}
export const TicketSchema = SchemaFactory.createForClass(Ticket);

// Pre-save hook: SLA hesaplama ve Ticket Number üretme
TicketSchema.pre('save', function (next) {
  const doc = this as any;
  
  if (doc.isNew) {
    // Ticket number normalde TicketsService.nextTicketNumber() ile (counter
    // collection, sıralı ve çakışmasız) atanır. Bu blok yalnızca servis
    // dışından yapılan kayıtlar için fallback'tir.
    if (!doc.ticketNumber) {
      const year = new Date().getFullYear();
      const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      doc.ticketNumber = `TCK-${year}-${random}`;
    }

    // SLA Hesaplama
    let hours = 24; // Default ORTA
    switch (doc.priority) {
      case TicketPriority.KRITIK: hours = 1; break;
      case TicketPriority.YUKSEK: hours = 4; break;
      case TicketPriority.ORTA: hours = 24; break;
      case TicketPriority.DUSUK: hours = 72; break;
    }
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + hours);
    doc.slaDeadline = deadline;
  }
  next();
});
