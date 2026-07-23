import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const stripHtml = (value: string): string =>
  typeof value === 'string'
    ? value.replace(/<[^>]*>/g, '').trim()
    : value;

export class AddMessageDto {
  @IsString({ message: 'Mesaj içeriği metin olmalıdır' })
  @MinLength(1, { message: 'Mesaj içeriği boş olamaz' })
  @MaxLength(2000, { message: 'Mesaj en fazla 2000 karakter olabilir' })
  @Transform(({ value }) => stripHtml(value))
  content: string;

  @IsOptional()
  @IsBoolean({ message: 'awaitCustomer true/false olmalıdır' })
  awaitCustomer?: boolean;
}
