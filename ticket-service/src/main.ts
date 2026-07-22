import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { MongoExceptionFilter } from './common/filters/mongo-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // REST API Configuration
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new MongoExceptionFilter());
  app.enableCors(); // Websockets ve API CORS

  // RabbitMQ Microservice Configuration
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URI || 'amqp://asistcell:asistcell_secret@localhost:5672'],
      queue: 'ticket_updates_queue', // Ai-service bu kuyruğa ticket.analyzed atacak
      queueOptions: {
        durable: true,
      },
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`Ticket Service (HTTP & RabbitMQ) is running on port: ${port}`);
}
bootstrap();
