import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { MongoExceptionFilter } from './common/filters/mongo-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new MongoExceptionFilter());
  app.enableCors(); // Websockets ve API CORS

  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`Ticket Service is running on port: ${port}`);
}
bootstrap();
