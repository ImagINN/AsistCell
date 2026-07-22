# ai-service

Yapay zeka destekli ticket analizi: kategori/duygu/öncelik sınıflandırması ve
uygun temsilciye otomatik atama. Google Gemini API ile çalışır, API çökük/limitliyse
circuit breaker devreye girer ve ticket manuel atama kuyruğuna düşer.

## Sorumluluk

- RabbitMQ üzerinden gelen yeni ticket'ları analiz etme (kategori, duygu, öncelik)
- Uzmanlık ve kapasiteye göre en uygun temsilciye otomatik atama önerisi üretme
- Gemini API çağrılarını circuit breaker ile koruma (eşik aşılınca API'yi geçici
  devre dışı bırakıp fallback'e (`category: 'BELIRSIZ'`, manuel atama) düşme)
- Analiz sonuçlarını `AnalysisLog` olarak kaydetme ve `/stats` ile raporlama
- Temsilci (agent) kayıtlarını (uzmanlık, kapasite, aktif ticket sayısı) yönetme
- Ticket kapandığında temsilcinin aktif ticket sayısını (kapasitesini) geri düşürme

Bu servis kapalıyken ticket-service'in çalışmaya devam etmesi beklenir — ticket
oluşturma AI Service'e senkron bağımlı değildir (bkz. [ticket-service](../ticket-service/README.md)).

## Teknoloji

FastAPI · SQLAlchemy 2 (async) + `asyncpg` + Alembic (PostgreSQL) · `aio-pika`
(RabbitMQ) · `google-generativeai` (Gemini) · `tenacity`

## Veri Modeli (SQLAlchemy)

- `Agent`: id, name, email, expertise, active_ticket_count, max_capacity, performance_score, is_active
- `AnalysisLog`: id, ticket_id, category, confidence, sentiment, priority,
  assigned_agent_id, manual_queue, fallback_used, fallback_reason

## Endpoint'ler

Base path: `/api/v1/ai` (Kong route'unda `jwt` plugin zorunlu; servisin kendisi
ayrıca lokal bir auth kontrolü yapmaz, doğrulama tamamen Kong'da yapılır).

| Method | Path | Açıklama |
|---|---|---|
| POST | `/analyze` | Ticket'ı sınıflandırır ve temsilci atama önerisi üretir (Gemini + circuit breaker fallback) |
| GET | `/health` | Servis sağlığı + circuit breaker durumu/hata sayısı |
| GET | `/stats` | Toplam analiz sayısı, fallback sayısı, manuel kuyruğa düşen sayısı |
| POST | `/agents` | Yeni temsilci (agent) kaydı oluşturur |
| GET | `/agents` | Temsilcileri isme göre listeler |
| PATCH | `/agents/{agent_id}` | Temsilci bilgilerini günceller |

## RabbitMQ

**Dinlenen event'ler** (queue: `ai_analysis_queue`, gönderen: ticket-service):

| Event | Payload | Davranış |
|---|---|---|
| `ticket.created` | `{ ticketId, title, description }` | Analizi çalıştırır, sonucu `ticket.analyzed` ile geri yayınlar |
| `ticket.released` | `{ ticketId, agentId, resolved }` | İlgili temsilcinin `active_ticket_count`'unu azaltır |

**Yayınlanan event'ler** (routing key: `ticket_updates_queue`, tüketen: ticket-service):

| Event | Payload |
|---|---|
| `ticket.analyzed` | `{ ticketId, category, sentiment, priority, assignedAgentId }` |

## Environment Değişkenleri

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `PORT` | HTTP port | `3003` |
| `DATABASE_URL` | SQLAlchemy async PostgreSQL bağlantı string'i | — (zorunlu) |
| `RABBITMQ_URI` | AMQP broker URL | `amqp://asistcell:asistcell_secret@rabbitmq:5672/` |
| `GEMINI_API_KEY` | Gemini API anahtarı | boş (analiz fallback'e düşer) |
| `GEMINI_MODEL` | Kullanılacak Gemini modeli | `gemini-flash-latest` (compose override; kod varsayılanı `gemini-2.5-flash`, emekli edildiği için compose'da override edilir) |
| `CB_FAILURE_THRESHOLD` | Circuit breaker'ın açılması için ardışık hata eşiği | `3` |
| `CB_RECOVERY_TIMEOUT` | Circuit breaker'ın tekrar denemeden önce bekleme süresi (sn) | `30` |

## Çalıştırma

`docker-compose.yml` içinde `ai-service` + `ai-postgres` + `rabbitmq`
bağımlılıklarıyla ayağa kalkar (başlangıçta `alembic upgrade head` çalışır).
Host'a port açmaz; Kong üzerinden (`http://localhost:8000/api/v1/ai/...`) erişilir.
