import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const TICKET_CATEGORIES = ['FATURA', 'SEBEKE', 'CIHAZ', 'TARIFE', 'IPTAL'] as const;

export class UpdateCategoryDto {
  @ApiProperty({ enum: TICKET_CATEGORIES, description: 'AI override — değişiklik doğruluk metriğine yansır' })
  @IsIn(TICKET_CATEGORIES, {
    message: 'Kategori FATURA, SEBEKE, CIHAZ, TARIFE veya IPTAL olmalıdır',
  })
  category: string;
}
