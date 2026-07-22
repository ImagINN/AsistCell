import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// path, Kong'un /api/v1/tickets route'u üzerinden erişilebilsin diye
// varsayılan /socket.io yerine route prefix'i ile başlar.
@WebSocketGateway({
  path: '/api/v1/tickets/socket.io',
  cors: {
    origin: '*',
  },
})
export class TicketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('TicketsGateway');

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    // Token; socket.io auth alanından veya Kong'un doğruladığı jwt query
    // parametresinden gelir. Oda üyeliği client'ın beyan ettiği userId'ye
    // değil, doğrulanmış token'daki sub claim'ine dayanır.
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query.jwt as string);

    try {
      const payload = this.jwtService.verify(token ?? '', {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      client.join(`user_${payload.sub}`);
      this.logger.log(`Client ${client.id} connected as user_${payload.sub}`);
    } catch {
      this.logger.warn(`Client ${client.id} rejected: invalid or missing token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Event emitters
  notifyTicketCreated(userId: string, ticket: any) {
    // Müşteriye bildirim
    this.server.to(`user_${userId}`).emit('ticket_created', ticket);
    // Temsilcilere genel bildirim
    this.server.emit('new_ticket_arrived', ticket);
  }

  notifyTicketStatusUpdated(userId: string, ticket: any) {
    this.server.to(`user_${userId}`).emit('ticket_status_updated', ticket);

    if (ticket.assignedAgentId) {
       this.server.to(`user_${ticket.assignedAgentId}`).emit('assigned_ticket_updated', ticket);
    }

    // Süpervizör panosu gibi tüm talepleri izleyen istemciler için genel yayın
    this.server.emit('ticket_updated', ticket);
  }

  notifyNewMessage(ticket: any, message: any) {
    // İlgili müşteri ve temsilciye mesaj bildirimi
    this.server.to(`user_${ticket.customerId}`).emit('new_message', { ticketId: ticket.ticketNumber, message });
    if (ticket.assignedAgentId) {
      this.server.to(`user_${ticket.assignedAgentId}`).emit('new_message', { ticketId: ticket.ticketNumber, message });
    }
  }
}
