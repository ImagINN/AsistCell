import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // DTO'da tanımlı olmayan alanları sil
      forbidNonWhitelisted: true, // Tanımsız alan gelirse hata fırlat
      transform: true,           // Gelen veriyi DTO tipine dönüştür
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`Identity Service is running on port ${port}`);
}

bootstrap();
