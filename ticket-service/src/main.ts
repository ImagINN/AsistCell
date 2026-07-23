import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { MongoExceptionFilter } from './common/filters/mongo-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // REST API Configuration
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new MongoExceptionFilter());
  app.enableCors(); // Websockets ve API CORS

  // Swagger/OpenAPI — Kong route'u strip_path:false olduğu için UI de aynı
  // `/api/v1/tickets` prefix'i altında yayınlanır, yoksa Kong arkasından
  // (http://localhost:8000/...) erişilemez.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AsistCell — Ticket Service')
    .setDescription(
      'Destek talebi yaşam döngüsü: oluşturma, durum makinesi, atama (manuel/AI), ' +
      'mesajlaşma, SLA takibi, müşteri puanlaması. Detaylar için repo kökü README.md ve EVENTS.md.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('tickets', 'Talep CRUD, durum makinesi, atama, mesajlaşma, puanlama')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/tickets/docs', app, swaggerDocument);

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
