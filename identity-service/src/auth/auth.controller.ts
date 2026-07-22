import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Ip,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { InternalAuditDto } from './dto/internal-audit.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  // POST /api/v1/auth/internal/audit — diğer servislerin (ticket-service vb.)
  // yetkisiz erişim denemelerini merkezi audit'e yazması için.
  // Servisler arası paylaşılan INTERNAL_API_KEY başlığı ile korunur.
  @Post('internal/audit')
  @HttpCode(HttpStatus.NO_CONTENT)
  internalAudit(
    @Headers('x-internal-key') key: string | undefined,
    @Body() dto: InternalAuditDto,
  ) {
    const expected = process.env.INTERNAL_API_KEY;
    if (!expected || key !== expected) {
      throw new ForbiddenException('Invalid internal key');
    }
    this.auditService.log({ ...dto, detail: dto.detail as Prisma.InputJsonValue });
  }

  // GET /api/v1/auth/health — Docker healthcheck (kimliksiz)
  @Get('health')
  health() {
    return { status: 'ok', service: 'identity-service' };
  }

  // POST /api/v1/auth/otp/request — kayıt öncesi OTP isteği (simülasyon)
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto.gsmNumber);
  }

  // POST /api/v1/auth/register
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.authService.register(dto, ip);
  }

  // POST /api/v1/auth/login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
  }

  // POST /api/v1/auth/refresh
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  async refresh(@GetUser() user: User & { refreshToken: string }) {
    return this.authService.refresh(user);
  }

  // POST /api/v1/auth/logout
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refresh_token);
  }

  // GET /api/v1/auth/me  (Kong JWT doğruladıktan sonra çağrılır)
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  getMe(@GetUser() user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUser } = user as any;
    return safeUser;
  }
}
