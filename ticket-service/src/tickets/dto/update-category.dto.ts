import { IsIn } from 'class-validator';

export const TICKET_CATEGORIES = ['FATURA', 'SEBEKE', 'CIHAZ', 'TARIFE', 'IPTAL'] as const;

export class UpdateCategoryDto {
  @IsIn(TICKET_CATEGORIES, {
    message: 'Kategori FATURA, SEBEKE, CIHAZ, TARIFE veya IPTAL olmalıdır',
  })
  category: string;
}
