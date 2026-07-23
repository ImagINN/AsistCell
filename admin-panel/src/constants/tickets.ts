export const CATEGORY_LABELS: Record<string, string> = {
  FATURA: 'Fatura',
  SEBEKE: 'Şebeke',
  CIHAZ: 'Cihaz',
  TARIFE: 'Tarife',
  IPTAL: 'İptal',
  BELIRSIZ: 'Belirsiz',
};

export const CATEGORY_COLORS: Record<string, string> = {
  FATURA: '#163F93',
  SEBEKE: '#0EA5E9',
  CIHAZ: '#F59E0B',
  TARIFE: '#10B981',
  IPTAL: '#8B5CF6',
  BELIRSIZ: '#94A3B8',
};

export const STATUS_LABELS: Record<string, string> = {
  YENI: 'Yeni',
  ATANDI: 'Atandı',
  ISLEMDE: 'İşlemde',
  MUSTERI_BEKLENIYOR: 'Müşteri Bekleniyor',
  COZULDU: 'Çözüldü',
  KAPANDI: 'Kapandı',
  IPTAL: 'İptal',
};

export const PRIORITY_LABELS: Record<string, string> = {
  KRITIK: 'Kritik',
  YUKSEK: 'Yüksek',
  ORTA: 'Orta',
  DUSUK: 'Düşük',
};

export const PRIORITY_COLORS: Record<string, string> = {
  KRITIK: '#DC2626',
  YUKSEK: '#F97316',
  ORTA: '#2563EB',
  DUSUK: '#64748B',
};

export const SENTIMENT_LABELS: Record<string, string> = {
  OFKELI: 'Öfkeli',
  NOTR: 'Nötr',
  MEMNUN: 'Memnun',
};

export const SENTIMENT_COLORS: Record<string, string> = {
  OFKELI: '#DC2626',
  NOTR: '#94A3B8',
  MEMNUN: '#10B981',
};

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  YENI: ['ATANDI'],
  ATANDI: ['ISLEMDE'],
  ISLEMDE: ['MUSTERI_BEKLENIYOR', 'COZULDU'],
  MUSTERI_BEKLENIYOR: ['ISLEMDE'],
  COZULDU: ['KAPANDI', 'ISLEMDE'],
  KAPANDI: [],
  IPTAL: [],
};
