# AsistCell

Yapay zeka destekli müşteri destek otomasyon platformu. Event-driven microservices mimarisi üzerine inşa edilmiştir.

## Mimari

```
                         ┌─────────────────┐
                         │   API Gateway   │
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    ┌─────────▼──────┐  ┌────────▼───────┐  ┌────────▼───────┐  ┌────────────────┐
    │Identity Service│  │ Ticket Service │  │   AI Service   │  │ Gamification   │
    │  (PostgreSQL)  │  │   (MongoDB)    │  │  (PostgreSQL)  │  │ (PG + Redis)   │
    └────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘
              │                   │                   │                   │
              └───────────────────┴───────────────────┴───────────────────┘
                                          │
                                   ┌──────▼──────┐
                                   │  RabbitMQ   │
                                   │  (Broker)   │
                                   └─────────────┘
```

## Servisler

| Servis | Veritabanı | Açıklama |
|---|---|---|
| `api-gateway` | — | Tüm isteklerin giriş noktası |
| `identity-service` | PostgreSQL (5433) | Kimlik doğrulama ve yetkilendirme |
| `ticket-service` | MongoDB (27017) | Destek talebi yönetimi |
| `ai-service` | PostgreSQL (5434) | Yapay zeka entegrasyonu ve log yönetimi |
| `gamification-service` | PostgreSQL (5435) + Redis (6379) | Puan, rozet ve liderlik tablosu |

## Kurulum

### Gereksinimler

- Docker >= 24.x
- Docker Compose >= 2.x

### Hızlı Başlangıç

```bash
# 1. Ortam değişkenlerini ayarla
cp .env.example .env
# .env dosyasını düzenleyip güçlü şifreler girin

# 2. Altyapıyı başlat
docker compose up -d

# 3. Durumu kontrol et
docker compose ps
```

### Servis URL'leri (Geliştirme)

| Servis | URL |
|---|---|
| RabbitMQ Management UI | http://localhost:15672 |
| Identity PostgreSQL | `localhost:5433` |
| AI PostgreSQL | `localhost:5434` |
| Ticket MongoDB | `localhost:27017` |
| Gamification PostgreSQL | `localhost:5435` |
| Gamification Redis | `localhost:6379` |

### Altyapıyı Durdur

```bash
docker compose down          # Container'ları durdur (veriler korunur)
docker compose down -v       # Container'ları ve volume'ları sil (dikkat!)
```

## Branch Stratejisi

- `main` — Kararlı, production-ready kod
- `dev` — Aktif geliştirme branch'i
- `feature/*` — Özellik branch'leri (dev'den dallanır)
- `fix/*` — Hata düzeltme branch'leri

## Lisans

MIT
