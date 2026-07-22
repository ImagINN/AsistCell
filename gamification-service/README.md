# gamification-service

Temsilciler için puan, rozet ve liderlik tablosu (leaderboard) sistemi. Ticket
çözümü/değerlendirmesi gibi olaylara göre RabbitMQ üzerinden puan hesaplar.

## Sorumluluk

- Ticket çözüldüğünde/değerlendirildiğinde otomatik puanlama (base + SLA bonusu/cezası +
  müşteri memnuniyeti bonusu)
- Temsilci gamification profilinin (seviye: BRONZE/SILVER/GOLD/PLATINUM, rozetler)
  ve puan geçmişinin tutulması
- Liderlik tablosu (leaderboard) sorgulama
- Puanın manuel olarak eklenmesi (`/agents/:id/points`)

Bu servis kendi başına event yayınlamaz — sadece ticket-service'ten gelen
event'leri tüketen bir consumer'dır (`/points` endpoint'i hariç, o senkron bir
REST çağrısıdır).

## Teknoloji

NestJS 10 · Prisma 5 (PostgreSQL) · `@nestjs/microservices` (RabbitMQ, amqplib) ·
`ioredis` (Redis)

## Veri Modeli (Prisma)

`AgentProfile`, `AgentBadge`, `PointHistory` — enum'lar: `Level`
(BRONZE/SILVER/GOLD/PLATINUM), `BadgeType`
(ILK_ADIM/HIZ_USTASI/MUSTERI_DOSTU/MARATONCU/KRIZ_YONETICISI/UZMAN).

## Endpoint'ler

Base path: `/api/v1/game` (Kong route'unda `jwt` plugin zorunlu; servisin kendisi
ek bir rol kontrolü yapmaz, doğrulama Kong'da yapılır).

| Method | Path | Açıklama |
|---|---|---|
| GET | `/leaderboard` | Liderlik tablosu (`?period=&top=`, varsayılan `all_time` / 10) |
| GET | `/agents/:agentId` | Temsilcinin gamification profili |
| GET | `/agents/:agentId/history` | Temsilcinin puan geçmişi |
| POST | `/agents/:agentId/points` | Manuel puan ekler (`{ points, reason, ticketId? }`) |

## RabbitMQ

**Dinlenen event'ler** (queue: `gamification_queue`, gönderen: ticket-service):

| Event | Payload | Puanlama |
|---|---|---|
| `ticket.resolved` | `{ ticketId, agentId, slaMet, customerRating? }` | Taban 10 puan; SLA karşılandıysa +5, aşıldıysa −2; `customerRating >= 4.5` ise +15 |
| `ticket.rated` | `{ ticketId, agentId, rating }` | Değerlendirme puanına göre: 5→+15, 4→+8, 3→+2, 1-2→−5; ortalama hesaplamak için de kaydedilir |

## Environment Değişkenleri

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `PORT` | HTTP port | `3004` |
| `DATABASE_URL` | Prisma PostgreSQL bağlantı string'i | — (zorunlu) |
| `RABBITMQ_URI` | AMQP broker URL | `amqp://asistcell:asistcell_secret@localhost:5672` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis şifresi | `redis_secret` |

> Not: `JWT_ACCESS_SECRET` compose'da bu servise tanımlıdır ancak kodda
> kullanılmamaktadır — auth tamamen Kong'da uygulanır.

## Çalıştırma

`docker-compose.yml` içinde `gamification-service` + `gamification-postgres` +
`gamification-redis` + `rabbitmq` bağımlılıklarıyla ayağa kalkar. Host'a port
açmaz; Kong üzerinden (`http://localhost:8000/api/v1/game/...`) erişilir.
