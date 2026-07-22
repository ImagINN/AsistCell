import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TicketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  
  private logger = new Logger('TicketsGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    
    // Auth işlemlerini token ile yapıp client'ı belirli odalara ekleyebiliriz
    // client.handshake.auth.token vs.
    
    // Şimdilik userId'si gelenleri kendi odasına ekleyelim
    const userId = client.handshake.query.userId as string;
    if (userId) {
      client.join(`user_${userId}`);
      this.logger.log(`Client ${client.id} joined room user_${userId}`);
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
  }

  notifyNewMessage(ticket: any, message: any) {
    // İlgili müşteri ve temsilciye mesaj bildirimi
    this.server.to(`user_${ticket.customerId}`).emit('new_message', { ticketId: ticket.ticketNumber, message });
    if (ticket.assignedAgentId) {
      this.server.to(`user_${ticket.assignedAgentId}`).emit('new_message', { ticketId: ticket.ticketNumber, message });
    }
  }
}
