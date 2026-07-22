# identity-service

Kimlik doğrulama, yetkilendirme ve kullanıcı yönetimi servisi. Kullanıcı kaydı/girişi,
JWT access/refresh token üretimi, rol yönetimi (ADMIN/SUPERVIZOR/TEMSILCI/USER) ve
audit log kaydı bu serviste yapılır.

## Sorumluluk

- Kullanıcı kaydı (OTP doğrulaması ile simüle edilmiş) ve login
- Access/refresh JWT üretimi, doğrulanması ve rotasyonu
- Kullanıcı profili yönetimi (kendi profilini görüntüleme/güncelleme)
- Admin tarafından kullanıcı listeleme, oluşturma ve rol değiştirme
- Audit log tutulması ve listelenmesi
- İlk kurulumda `.env` üzerinden tanımlı bir ADMIN hesabının otomatik seed edilmesi

Bu servis başka hiçbir servise (ne REST ne de RabbitMQ ile) bağımlı değildir ve
kendisi de başka bir servisle mesajlaşmaz — diğer servisler, gelen isteklerdeki
JWT'yi (Kong üzerinden) doğrulayarak kimlik bilgisine erişir.

## Teknoloji

NestJS 10 · Prisma 5 (PostgreSQL) · `@nestjs/jwt` + `passport-jwt` · bcrypt

## Veri Modeli (Prisma)

`User`, `RefreshToken`, `AuditLog` — enum'lar: `Role` (USER/TEMSILCI/SUPERVIZOR/ADMIN),
`Specialty` (FATURA/SEBEKE/CIHAZ/TARIFE/IPTAL).

## Endpoint'ler

Base path: `/api/v1/auth` (Kong `/api/v1/auth` route'u üzerinden yönlendirilir,
bu route'ta Kong `jwt` plugin'i **yoktur** — token burada üretilir).

| Method | Path | Açıklama | Yetki |
|---|---|---|---|
| GET | `/health` | Docker healthcheck | Public |
| POST | `/otp/request` | Kayıt öncesi OTP isteği (simüle edilmiş) | Public |
| POST | `/register` | Yeni kullanıcı kaydı | Public |
| POST | `/login` | Giriş, access+refresh token üretir | Public |
| POST | `/refresh` | Token rotasyonu | Refresh token (`JwtRefreshGuard`) |
| POST | `/logout` | Refresh token'ı iptal eder | Public (body: `refresh_token`) |
| GET | `/me` | Kendi profilini getirir | JWT |
| PATCH | `/me` | Kendi profilini günceller | JWT |
| GET | `/users` | Tüm kullanıcıları listeler | JWT + `ADMIN` |
| POST | `/users` | Rol belirterek kullanıcı oluşturur | JWT + `ADMIN` |
| PATCH | `/users/:id/role` | Kullanıcının rolünü değiştirir | JWT + `ADMIN` |
| GET | `/audit-logs` | Audit logları listeler (`?take=&skip=`) | JWT + `ADMIN` |

## Environment Değişkenleri

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `PORT` | HTTP port | `3001` |
| `DATABASE_URL` | Prisma PostgreSQL bağlantı string'i | — (zorunlu) |
| `JWT_ACCESS_SECRET` | Access token imzalama/doğrulama sırrı — Kong da aynı sırrı kullanır | — (zorunlu) |
| `JWT_REFRESH_SECRET` | Refresh token imzalama/doğrulama sırrı | — (zorunlu) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Açılışta yoksa oluşturulan/varsa ADMIN'e yükseltilen ilk hesap | boş (seed atlanır) |
| `OTP_CODE` | Simüle edilmiş OTP akışı için sabit kod | `1234` |

## Çalıştırma

Bağımsız container olarak `docker-compose.yml` içinde `identity-service` +
`identity-postgres` servisleriyle ayağa kalkar. Host'a port açmaz; Kong üzerinden
(`http://localhost:8000/api/v1/auth/...`) erişilir.
