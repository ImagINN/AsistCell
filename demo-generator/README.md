# Demo Generator

Demo/canlı test sırasında sistemi uçtan uca hareketli tutan yardımcı bir
araç. AsistCell'in dört zorunlu mikroservisinden biri değildir — sadece API
Gateway'e dıştan istek atan bir demo/yük script'idir.

## Ne yapar

Dört bağımsız döngü çalıştırır:

1. **Müşteri talep üretimi** — `CUSTOMER_POOL_SIZE` (varsayılan 8) sahte
   müşteri hesabı üzerinden her `INTERVAL_MS` (varsayılan 5000ms) rastgele
   kategoride bir talep açar.
2. **Temsilci botları** — `ADMIN_EMAIL`/`ADMIN_PASSWORD` ile giriş yapıp
   (yoksa) her kategori için bir tane olmak üzere 6 demo temsilci hesabı
   oluşturur, sonra her `AGENT_TICK_MS`'de kendilerine atanan talepleri
   otomatik ilerletir: `ATANDI → İŞLEMDE → ÇÖZÜLDÜ`. Bu döngü olmadan AI'ın
   atadığı temsilciler hiçbir zaman kapasite boşaltmaz ve yeni talepler
   atanamaz hale gelir (spec 5.3'teki kapasite/skor mekanizması gerçek bir
   "işi biten temsilci" olmadan asla temizlenmez).
3. **Süpervizör botu** — her `SUPERVISOR_TICK_MS`'de (a) hâlâ `YENI`
   durumunda (kimseye atanmamış) talepleri uygun temsilciye atar, (b) bot
   havuzu dışındaki bir temsilciye atanıp `STALE_ASSIGNMENT_MS`'den uzun
   süredir ilerlemeyen talepleri bot havuzuna devrederek kurtarır.
4. **Müşteri kapanış/puanlama** — her müşteri kendi ÇÖZÜLDÜ durumundaki
   taleplerini onaylar (`KAPANDI`) ve 4-5 yıldız puanlar. Böylece açılan
   her talep gerçekten kapanma noktasına ulaşır.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `API_BASE_URL` | `http://kong:8000/api/v1` | API Gateway adresi |
| `INTERVAL_MS` | `5000` | İki talep arası bekleme süresi |
| `CUSTOMER_POOL_SIZE` | `8` | Sahte müşteri hesabı sayısı |
| `AGENT_TICK_MS` | `4000` | Temsilci botlarının talep ilerletme sıklığı |
| `SUPERVISOR_TICK_MS` | `6000` | Süpervizör botunun atama turu sıklığı |
| `STALE_ASSIGNMENT_MS` | `90000` | Bot havuzu dışı atamanın "takılı" sayılma süresi |
| `OTP_CODE` | `1234` | identity-service'teki simülasyon OTP kodu |
| `DEMO_PASSWORD` | `DemoMusteri!2026` | Demo müşteri hesaplarının şifresi |
| `AGENT_PASSWORD` | `DemoTemsilci!2026` | Demo temsilci/süpervizör hesaplarının şifresi |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Temsilci/süpervizör botlarını oluşturmak için admin hesabı (docker-compose'da `.env`'den geçirilir). Boşsa yalnızca talep üretimi çalışır, atama/ilerletme botları devre dışı kalır. |

## Çalıştırma

```
docker compose up -d demo-generator
```

Durdurmak için (örn. jürinin güvenlik testi sırasında arka planda gürültü
istemiyorsanız):

```
docker compose stop demo-generator
docker compose start demo-generator
```
