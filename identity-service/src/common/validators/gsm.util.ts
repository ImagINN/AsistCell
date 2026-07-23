// Türk GSM numarası: Öneksiz, 5XX ile başlayan tam 10 hane.
// Boşluk ve tire girilebilir; normalize edilince '5XXXXXXXXX' formatında saklanır.
export const GSM_REGEX = /^5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/;

export function normalizeGsm(gsm: string): string {
  const digits = gsm.replace(/\D/g, '');
  // Son 10 haneyi al; zaten 5XX ile başlaması zorunlu olduğundan direkt döndür.
  return digits.slice(-10);
}
