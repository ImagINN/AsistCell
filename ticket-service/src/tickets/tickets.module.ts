import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketsGateway } from './tickets.gateway';
import { Ticket, TicketSchema } from './schemas/ticket.schema';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const RABBITMQ_URLS = [
  process.env.RABBITMQ_URI || 'amqp://asistcell:asistcell_secret@localhost:5672',
];

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ticket.name, schema: TicketSchema }]),
    JwtModule.register({}),
    ClientsModule.register([
      {
        name: 'AI_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: RABBITMQ_URLS,
          queue: 'ai_analysis_queue',
          queueOptions: {
            durable: true
          },
        },
      },
      {
        name: 'GAMIFICATION_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: RABBITMQ_URLS,
          queue: 'gamification_queue',
          queueOptions: {
            durable: true
          },
        },
      },
    ]),
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsGateway, JwtAuthGuard],
})
export class TicketsModule {}
