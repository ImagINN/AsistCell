import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

// Diğer mikroservislerin (örn. ticket-service) yetkisiz erişim denemelerini
// merkezi audit log'a yazabilmesi için kullanılır.
export class InternalAuditDto {
  @IsString()
  @MaxLength(64)
  action: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  actorEmail?: string;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;

  @IsOptional()
  @IsBoolean()
  success?: boolean;

  @IsOptional()
  @IsObject()
  detail?: Record<string, unknown>;
}
