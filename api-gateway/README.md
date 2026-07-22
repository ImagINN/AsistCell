# api-gateway (Kong)

Sistemin tek giriş noktası. Bağımsız bir uygulama değil, **Kong** (DB-less/declarative
mod) ile yapılandırılmış bir API Gateway'dir. Bu klasör placeholder'dır — asıl
konfigürasyon repo kökündeki [`kong.yml`](../kong.yml) dosyasında, container tanımı
ise kök [`docker-compose.yml`](../docker-compose.yml) içindeki `kong` servisindedir.

## Sorumluluk

- Tüm client isteklerini karşılayıp ilgili backend servise yönlendirme (reverse proxy)
- JWT doğrulama (identity-service hariç tüm route'larda zorunlu)
- Rate limiting, CORS, request correlation ID (`X-Request-ID`) ekleme
- Backend servisleri host'a hiç port açmadan yalnızca Docker internal network
  üzerinden erişilebilir tutma — dışarıdan tek erişim noktası Kong'dur

## Yapılandırma

Kong DB-less modda çalışır (`KONG_DATABASE: off`); config dosyası Kong env
interpolasyonu yapmadığı için container başlangıcında `awk` ile `${JWT_SECRET}`
placeholder'ı gerçek `JWT_ACCESS_SECRET` değeriyle değiştirilip
`/tmp/kong.yml`'e yazılır, ardından bu dosya declarative config olarak yüklenir.

**Consumer:** `asistcell-identity-issuer` — `jwt_secrets` key'i `asistcell-identity-service`
(identity-service'in ürettiği JWT'lerin `iss` claim'iyle eşleşmeli), algoritma HS256.

## Route'lar

| Servis | Upstream | Path | Plugin'ler |
|---|---|---|---|
| identity-service | `http://identity-service:3001` | `/api/v1/auth` | `rate-limiting` (20/dk, 500/sa, IP bazlı) — **jwt plugin yok** (token burada üretilir) |
| ticket-service | `http://ticket-service:3002` | `/api/v1/tickets` | `jwt` (anonim erişim kapalı) |
| ai-service | `http://ai-service:3003` | `/api/v1/ai` | `jwt`; `read_timeout: 60000` (AI yanıtları için uzatılmış) |
| gamification-service | `http://gamification-service:3004` | `/api/v1/game` | `jwt` |

**Global plugin'ler (tüm route'lar):**

| Plugin | Ayar |
|---|---|
| `rate-limiting` | 100/dk, 3000/sa, IP bazlı, local policy |
| `cors` | origin `*` (⚠ production'da kısıtlanmalı), credentials true, max_age 3600 |
| `correlation-id` | `X-Request-ID` header'ı (uuid#counter) |

## Environment Değişkenleri

| Değişken | Açıklama |
|---|---|
| `JWT_SECRET` | Kong container'ının kullandığı değişken adı; `docker-compose.yml`'de `JWT_ACCESS_SECRET`'ten set edilir (tek kaynak: identity-service'in imzaladığı sırla aynı olmalı) |

## Portlar

| Port | Açıklama |
|---|---|
| `8000` | Proxy — tüm client istekleri buraya gelir (host'a açık) |
| `8001` | Admin API — sadece durum sorgulama (DB-less modda read-only, host'a açık) |

## Çalıştırma

`docker-compose.yml` içinde `kong` servisi olarak, `./kong.yml` dosyasını
read-only mount ederek ayağa kalkar. `admin-panel` ve tüm dış istemciler bu
servise (`http://localhost:8000`) bağlanır.
