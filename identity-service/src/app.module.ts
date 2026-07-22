import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,  // Global — tüm modüllere inject edilir
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
