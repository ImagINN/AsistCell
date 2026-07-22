import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// JwtAuthGuard'ı devre dışı bırakır (health check gibi kimliksiz endpoint'ler için)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
