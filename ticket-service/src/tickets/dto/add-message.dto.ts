import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AddMessageDto {
  @IsString({ message: 'Mesaj içeriği metin olmalıdır' })
  @MinLength(1, { message: 'Mesaj içeriği boş olamaz' })
  @MaxLength(2000, { message: 'Mesaj en fazla 2000 karakter olabilir' })
  content: string;

  // Temsilci müşteriden bilgi istiyorsa true gönderir:
  // durum ISLEMDE ise MUSTERI_BEKLENIYOR'a çekilir (spec: "çekilebilir" — opsiyonel)
  @IsOptional()
  @IsBoolean({ message: 'awaitCustomer true/false olmalıdır' })
  awaitCustomer?: boolean;
}
