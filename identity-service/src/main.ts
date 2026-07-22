import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

// Ilk kurulumda ADMIN_EMAIL/ADMIN_PASSWORD env degiskenlerinden bir
// yonetici hesabi olusturur. Hesap zaten varsa rolunu ADMIN'e yukseltir.
// Boylece paneli yonetebilecek ilk kullanici icin manuel DB mudahalesi gerekmez.
async function seedAdminUser(prisma: PrismaService, logger: Logger): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    logger.warn('ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin seed');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role !== Role.ADMIN) {
      await prisma.user.update({ where: { email }, data: { role: Role.ADMIN } });
      logger.log(`Existing user ${email} promoted to ADMIN`);
    }
    return;
  }

  await prisma.user.create({
    data: {
      email,
      password: await bcrypt.hash(password, 12),
      firstName: 'Sistem',
      lastName: 'Yoneticisi',
      role: Role.ADMIN,
    },
  });
  logger.log(`Admin user seeded: ${email}`);
}

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

  await seedAdminUser(app.get(PrismaService), logger);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`Identity Service is running on port ${port}`);
}

bootstrap();
