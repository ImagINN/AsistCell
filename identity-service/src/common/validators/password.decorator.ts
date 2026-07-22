import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength, Matches } from 'class-validator';

// Şifre politikası: min 8 karakter, en az 1 büyük harf, 1 rakam, 1 özel karakter.
// Her kural ayrı decorator'da — ihlal edilen her kural kendi Türkçe mesajıyla döner.
export function IsStrongPassword() {
  return applyDecorators(
    IsString({ message: 'Şifre metin olmalıdır' }),
    MinLength(8, { message: 'Şifre en az 8 karakter olmalıdır' }),
    MaxLength(64, { message: 'Şifre en fazla 64 karakter olabilir' }),
    Matches(/[A-Z]/, { message: 'Şifre en az 1 büyük harf içermelidir' }),
    Matches(/\d/, { message: 'Şifre en az 1 rakam içermelidir' }),
    Matches(/[^A-Za-z0-9]/, { message: 'Şifre en az 1 özel karakter içermelidir' }),
  );
}
