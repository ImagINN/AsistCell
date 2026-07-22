import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string;
  actorEmail?: string;
  action: string;
  targetId?: string;
  ipAddress?: string;
  success?: boolean;
  detail?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  // Fire-and-forget: audit yazımı ana akışı asla bloklamaz / patlatmaz
  log(entry: AuditEntry): void {
    this.prisma.auditLog
      .create({ data: entry })
      .catch((err) => this.logger.error(`Audit log failed: ${err.message}`));
  }

  async findAll(take = 50, skip = 0) {
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(take, 200),
        skip,
      }),
      this.prisma.auditLog.count(),
    ]);
    return { items, total, take, skip };
  }
}
