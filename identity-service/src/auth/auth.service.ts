import {
  Injectable,
  BadRequestException,
  ConflictException,
  HttpException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { normalizeGsm } from '../common/validators/gsm.util';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

type SafeUser = Omit<User, 'password'>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;
  private readonly ACCESS_TOKEN_EXPIRES_IN = 15 * 60;        // 15 dakika (saniye)
  private readonly REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 gün (saniye)
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MS = 15 * 60 * 1000;        // 15 dakika
  // OTP simülasyonu: gerçek SMS sağlayıcısı yerine sabit kod (env ile değiştirilebilir)
  private readonly OTP_CODE = process.env.OTP_CODE ?? '1234';

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
  ) {}

  // ── OTP (simülasyon) ─────────────────────────────────────────
  // Gerçek entegrasyonda SMS sağlayıcısına istek atılır; simülasyonda
  // sabit kod (1234) kullanıldığı için yalnızca bilgilendirme döner.
  // Numara zaten kayıtlıysa kullanıcı OTP adımına geçmeden burada uyarılır.
  async requestOtp(gsmNumber: string): Promise<{ message: string; gsmNumber: string }> {
    const normalized = normalizeGsm(gsmNumber);

    const existing = await this.prisma.user.findUnique({ where: { gsmNumber: normalized } });
    if (existing) {
      throw new ConflictException('Bu GSM numarası ile kayıtlı bir hesap zaten var');
    }

    this.logger.log(`OTP requested for ${normalized} (simulation)`);
    return {
      message: 'Doğrulama kodu GSM numaranıza gönderildi',
      gsmNumber: normalized,
    };
  }

  // ── Register (Müşteri: GSM + OTP) ───────────────────────────
  async register(dto: RegisterDto, ip?: string): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    if (dto.otpCode !== this.OTP_CODE) {
      throw new BadRequestException('Doğrulama kodu hatalı');
    }

    const gsmNumber = normalizeGsm(dto.gsmNumber);

    const existingGsm = await this.prisma.user.findUnique({ where: { gsmNumber } });
    if (existingGsm) {
      throw new ConflictException('Bu GSM numarası ile kayıtlı bir hesap zaten var');
    }

    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException('Bu e-posta adresi ile kayıtlı bir hesap zaten var');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        gsmNumber,
        email: dto.email ?? null,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    const tokens = await this.generateAndStoreTokens(user);
    this.logger.log(`New customer registered: ${gsmNumber}`);
    this.audit.log({
      actorId: user.id,
      actorEmail: user.email ?? undefined,
      action: 'USER_REGISTERED',
      targetId: user.id,
      ipAddress: ip,
      success: true,
      detail: { gsmNumber },
    });

    return { user: this.sanitizeUser(user), tokens };
  }

  // ── Login (Personel: e-posta, Müşteri: GSM) ──────────────────
  async login(dto: LoginDto, ip?: string): Promise<{ user: SafeUser; tokens: AuthTokens }> {
    if (!dto.email && !dto.gsmNumber) {
      throw new BadRequestException('E-posta veya GSM numarası gereklidir');
    }

    const user = dto.email
      ? await this.prisma.user.findUnique({ where: { email: dto.email } })
      : await this.prisma.user.findUnique({
          where: { gsmNumber: normalizeGsm(dto.gsmNumber!) },
        });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Kullanıcı bilgileri hatalı');
    }

    // Hesap kilitli mi? Kalan süreyi sayaç için saniye cinsinden döndür.
    this.assertNotLocked(user);

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      await this.handleFailedAttempt(user, ip);
      // handleFailedAttempt kilitlediyse buraya gelinmez (423 fırlatır)
      const remaining =
        this.MAX_LOGIN_ATTEMPTS - (user.failedLoginAttempts + 1);
      throw new UnauthorizedException(
        `Şifre hatalı. Kalan deneme hakkı: ${remaining}`,
      );
    }

    // Başarılı giriş: sayaç ve kilidi sıfırla
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const tokens = await this.generateAndStoreTokens(user);
    this.logger.log(`User logged in: ${user.email ?? user.gsmNumber}`);
    this.audit.log({
      actorId: user.id,
      actorEmail: user.email ?? undefined,
      action: 'USER_LOGIN',
      targetId: user.id,
      ipAddress: ip,
      success: true,
    });

    return { user: this.sanitizeUser(user), tokens };
  }

  // ── Hesap Kilitleme ──────────────────────────────────────────
  private assertNotLocked(user: User): void {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingSeconds = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 1000,
      );
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      throw new HttpException(
        {
          statusCode: 423,
          error: 'AccountLocked',
          message: `Hesabınız kilitli. ${minutes} dakika ${seconds} saniye sonra tekrar deneyebilirsiniz`,
          lockedUntil: user.lockedUntil.toISOString(),
          remainingSeconds,
        },
        423, // Locked
      );
    }
  }

  private async handleFailedAttempt(user: User, ip?: string): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;

    if (attempts >= this.MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + this.LOCK_DURATION_MS);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil },
      });
      this.audit.log({
        actorId: user.id,
        actorEmail: user.email ?? undefined,
        action: 'ACCOUNT_LOCKED',
        targetId: user.id,
        ipAddress: ip,
        success: false,
        detail: { lockedUntil: lockedUntil.toISOString() },
      });
      const remainingSeconds = Math.ceil(this.LOCK_DURATION_MS / 1000);
      throw new HttpException(
        {
          statusCode: 423,
          error: 'AccountLocked',
          message: `5 başarısız deneme nedeniyle hesabınız 15 dakika kilitlendi`,
          lockedUntil: lockedUntil.toISOString(),
          remainingSeconds,
        },
        423, // Locked
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: attempts },
    });
    this.audit.log({
      actorId: user.id,
      actorEmail: user.email ?? undefined,
      action: 'LOGIN_FAILED',
      targetId: user.id,
      ipAddress: ip,
      success: false,
      detail: { attempts },
    });
  }

  // ── Refresh ──────────────────────────────────────────────────
  async refresh(user: User & { refreshToken: string }): Promise<AuthTokens> {
    // Eski refresh token'ı sil (rotation)
    await this.prisma.refreshToken.delete({
      where: { token: user.refreshToken },
    });

    return this.generateAndStoreTokens(user);
  }

  // ── Logout ───────────────────────────────────────────────────
  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });

    return { message: 'Logged out successfully' };
  }

  // ── Token Üretimi ─────────────────────────────────────────────
  private async generateAndStoreTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iss: 'asistcell-identity-service',  // Kong JWT plugin consumer key ile eşleşmeli
    };

    // jti: aynı saniye içinde üretilen token'lar (iat saniye hassasiyetinde)
    // birebir aynı imzayı üretip refresh_tokens.token unique kısıtına takılıyordu.
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: this.ACCESS_TOKEN_EXPIRES_IN,
        jwtid: randomUUID(),
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: this.REFRESH_TOKEN_EXPIRES_IN,
        jwtid: randomUUID(),
      }),
    ]);

    // Refresh token'ı DB'ye kaydet
    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + this.REFRESH_TOKEN_EXPIRES_IN * 1000),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: this.ACCESS_TOKEN_EXPIRES_IN,
    };
  }

  // ── Yardımcı: Password'ü yanıtta gizle ───────────────────────
  private sanitizeUser(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUser } = user;
    return safeUser;
  }
}
