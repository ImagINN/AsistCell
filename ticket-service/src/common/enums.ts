export enum TicketStatus {
  YENI = 'YENI',
  ATANDI = 'ATANDI',
  ISLEMDE = 'ISLEMDE',
  MUSTERI_BEKLENIYOR = 'MUSTERI_BEKLENIYOR',
  COZULDU = 'COZULDU',
  KAPANDI = 'KAPANDI',
  IPTAL = 'IPTAL',
}

export enum TicketPriority {
  KRITIK = 'KRITIK',
  YUKSEK = 'YUKSEK',
  ORTA = 'ORTA',
  DUSUK = 'DUSUK',
}

// AI servisinin talep metninden çıkardığı duygu tonu (OFKELI -> öncelik en az YUKSEK'e çekilir)
export enum TicketSentiment {
  OFKELI = 'OFKELI',
  NOTR = 'NOTR',
  MEMNUN = 'MEMNUN',
}

export enum MessageRole {
  MUSTERI = 'MUSTERI',
  TEMSILCI = 'TEMSILCI',
  SISTEM = 'SISTEM',
}

export enum TicketChannel {
  WEB = 'WEB',
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
