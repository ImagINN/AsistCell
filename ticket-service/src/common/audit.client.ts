import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { JwtUser } from './guards/jwt-auth.guard';

// Yetkisiz erişim denemelerini identity-service'in merkezi audit log'una yazar.
// Fire-and-forget: audit yazımı isteği asla bloklamaz / patlatmaz.
@Injectable()
export class AuditClient {
  private readonly logger = new Logger(AuditClient.name);
  private readonly baseUrl =
    process.env.IDENTITY_SERVICE_URL ?? 'http://identity-service:3001';
  private readonly internalKey = process.env.INTERNAL_API_KEY;

  private send(entry: Record<string, unknown>): void {
    if (!this.internalKey) return;

    fetch(`${this.baseUrl}/api/v1/auth/internal/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': this.internalKey,
      },
      body: JSON.stringify(entry),
    }).catch((err) => this.logger.warn(`Audit forward failed: ${err.message}`));
  }

  logAccessDenied(user: JwtUser, action: string, detail?: Record<string, unknown>): void {
    this.send({
      actorId: user.sub,
      actorEmail: user.email ?? undefined,
      action: 'ACCESS_DENIED',
      ipAddress: user.ip,
      success: false,
      detail: { service: 'ticket-service', attempted: action, role: user.role, ...detail },
    });
  }

  // Kritik başarılı işlemler (örn. talep çözümü/iptali) merkezi audit'e yazılır
  logEvent(user: JwtUser, action: string, targetId?: string, detail?: Record<string, unknown>): void {
    this.send({
      actorId: user.sub,
      actorEmail: user.email ?? undefined,
      action,
      targetId,
      ipAddress: user.ip,
      success: true,
      detail: { service: 'ticket-service', role: user.role, ...detail },
    });
  }

  // Yetki matrisi ihlali: audit'e yaz + 403 fırlat
  deny(user: JwtUser, action: string, message: string, detail?: Record<string, unknown>): never {
    this.logAccessDenied(user, action, detail);
    throw new ForbiddenException(message);
  }
}
