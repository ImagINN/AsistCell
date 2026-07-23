import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TicketStatus } from '../../common/enums';

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TicketStatus, description: 'Hedef durum — state machine kurallarına uymalı, aksi halde 422' })
  @IsEnum(TicketStatus, { message: 'Geçersiz talep durumu' })
  status: TicketStatus;

  @ApiPropertyOptional({ description: 'COZULDU geçişinde zorunlu (servis katmanı denetler)' })
  // COZULDU geçişinde zorunluluğu servis katmanı denetler (koşul ihlali: 422)
  @IsOptional()
  @IsString({ message: 'Çözüm notu metin olmalıdır' })
  resolutionNote?: string;
}
