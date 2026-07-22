export enum TicketStatus {
  YENI = 'YENI',
  ATANDI = 'ATANDI',
  ISLEMDE = 'ISLEMDE',
  MUSTERI_BEKLENIYOR = 'MUSTERI_BEKLENIYOR',
  COZULDU = 'COZULDU',
  IPTAL = 'IPTAL',
}

export enum TicketPriority {
  KRITIK = 'KRITIK',
  YUKSEK = 'YUKSEK',
  ORTA = 'ORTA',
  DUSUK = 'DUSUK',
}

export enum MessageRole {
  MUSTERI = 'MUSTERI',
  TEMSILCI = 'TEMSILCI',
  SISTEM = 'SISTEM',
}

// Identity Service'in JWT payload'ındaki rol değerleri
export enum UserRole {
  USER = 'USER',
  TEMSILCI = 'TEMSILCI',
  SUPERVIZOR = 'SUPERVIZOR',
  ADMIN = 'ADMIN',
}

export const STAFF_ROLES: string[] = [
  UserRole.TEMSILCI,
  UserRole.SUPERVIZOR,
  UserRole.ADMIN,
];

export function isStaff(role?: string): boolean {
  return !!role && STAFF_ROLES.includes(role);
}
