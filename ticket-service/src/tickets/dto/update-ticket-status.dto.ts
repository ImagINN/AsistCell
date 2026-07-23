import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TicketStatus } from '../../common/enums';

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus, { message: 'Geçersiz talep durumu' })
  status: TicketStatus;

  // COZULDU geçişinde zorunluluğu servis katmanı denetler (koşul ihlali: 422)
  @IsOptional()
  @IsString({ message: 'Çözüm notu metin olmalıdır' })
  resolutionNote?: string;
}
