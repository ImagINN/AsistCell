import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketsGateway } from './tickets.gateway';
import { Ticket, TicketSchema } from './schemas/ticket.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ticket.name, schema: TicketSchema }]),
    ClientsModule.register([
      {
        name: 'AI_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URI || 'amqp://asistcell:asistcell_secret@localhost:5672'],
          queue: 'ai_analysis_queue',
          queueOptions: {
            durable: true
          },
        },
      },
    ]),
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsGateway],
})
export class TicketsModule {}
