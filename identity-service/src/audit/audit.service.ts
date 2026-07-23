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

  // Sıralanabilir kolonlar beyaz liste ile sınırlıdır — orderBy alan adı
  // doğrudan kullanıcı girdisinden gelemez (Prisma zaten parametreli sorgu
  // üretir, ama yine de yalnızca bilinen kolonlara izin veriyoruz).
  private static readonly SORTABLE_FIELDS = new Set([
    'createdAt',
    'actorEmail',
    'action',
    'targetId',
  ]);

  async findAll(
    take = 50,
    skip = 0,
    sortBy = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
    search?: string,
  ) {
    const orderField = AuditService.SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt';
    const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';

    // Prisma tüm değerleri parametreli sorgu ile gönderir (ham SQL birleştirme
    // yapılmaz), bu yüzden arama girdisi SQL injection'a karşı güvenlidir.
    const where: Prisma.AuditLogWhereInput | undefined = search?.trim()
      ? {
          OR: [
            { actorEmail: { contains: search.trim(), mode: 'insensitive' } },
            { actorId: { contains: search.trim(), mode: 'insensitive' } },
            { action: { contains: search.trim(), mode: 'insensitive' } },
            { targetId: { contains: search.trim(), mode: 'insensitive' } },
            { ipAddress: { contains: search.trim(), mode: 'insensitive' } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { [orderField]: orderDirection },
        take: Math.min(take, 200),
        skip,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, take, skip };
  }
}
