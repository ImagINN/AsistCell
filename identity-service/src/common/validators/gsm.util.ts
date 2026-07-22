// Türk GSM numarası: +90/0 önekli veya öneksiz 5XX ile başlayan 10 hane.
// Boşluk ve tire girilebilir; normalize edilince '05XXXXXXXXX' formatında saklanır.
export const GSM_REGEX = /^(\+90|0)?\s*5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/;

export function normalizeGsm(gsm: string): string {
  const digits = gsm.replace(/\D/g, '');
  return `0${digits.slice(-10)}`;
}
