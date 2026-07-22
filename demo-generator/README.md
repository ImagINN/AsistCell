# Demo Generator

Demo/canlı test sırasında sistemi sürekli hareketli tutmak için, sabit bir
test müşteri havuzu üzerinden her `INTERVAL_MS` (varsayılan 5000ms) süresinde
bir rastgele talep açan yardımcı bir araç. AsistCell'in dört zorunlu
mikroservisinden biri değildir — sadece API Gateway'e dıştan istek atan bir
yük/demo script'idir.

## Ne yapar

1. Açılışta `CUSTOMER_POOL_SIZE` (varsayılan 8) adet sahte müşteri hesabı
   kaydeder (`05009900001`, `05009900002`, ...). Hesaplar zaten kayıtlıysa
   doğrudan giriş yapar.
2. Her `INTERVAL_MS`'de havuzdan rastgele bir müşteri seçer, kategori
   çeşitliliği olan (fatura/şebeke/cihaz/tarife/iptal, bazıları öfkeli
   tonlu) hazır şablonlardan birini kullanarak `POST /api/v1/tickets`
   çağırır.
3. Access token'lar 10 dakikayı geçince otomatik yenilenir (login).

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `API_BASE_URL` | `http://kong:8000/api/v1` | API Gateway adresi |
| `INTERVAL_MS` | `5000` | İki talep arası bekleme süresi |
| `CUSTOMER_POOL_SIZE` | `8` | Sahte müşteri hesabı sayısı |
| `OTP_CODE` | `1234` | identity-service'teki simülasyon OTP kodu |
| `DEMO_PASSWORD` | `DemoMusteri!2026` | Demo müşteri hesaplarının şifresi |

## Çalıştırma

```
docker compose up -d demo-generator
```

Durdurmak için (örn. jürinin güvenlik testi sırasında arka planda gürültü
istemiyorsanız):

```
docker compose stop demo-generator
```
