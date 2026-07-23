# ticket-service

Destek talebi (ticket) yaşam döngüsünü yöneten servis: oluşturma, durum makinesi,
atama (manuel/AI), mesajlaşma, değerlendirme (rating) ve gerçek zamanlı bildirimler.

## Sorumluluk

- Ticket CRUD ve durum makinesi (`YENI → ATANDI → ISLEMDE → MUSTERI_BEKLENIYOR → COZULDU`,
  her durumdan `IPTAL` mümkün)
- SLA hesaplama (priority'ye göre otomatik deadline: KRITIK 1s / YUKSEK 4s / ORTA 24s / DUSUK 72s)
- Ticket oluşturulduğunda AI Service'e **asenkron** analiz isteği gönderme
  (AI Service çökükse ticket yine de `category: 'BELIRSIZ'` ile oluşturulur, akış bloklanmaz)
- Manuel/AI kaynaklı temsilci ataması ve AI ataması sonrası yeniden atama takibi
  (`reassignedAfterAi`, AI doğruluk oranı hesaplamak için)
- Müşteri değerlendirmesi (1-5 rating) ve dashboard istatistikleri (SLA uyumu, memnuniyet, AI doğruluğu)
- WebSocket üzerinden gerçek zamanlı ticket/mesaj bildirimleri
- Ticket çözüldüğünde/iptal edildiğinde Gamification Service'e puan event'i, AI Service'e
  kapasite serbest bırakma event'i gönderme

## Teknoloji

NestJS 10 · Mongoose 8 (MongoDB) · `@nestjs/microservices` (RabbitMQ, amqplib) ·
`@nestjs/websockets` + Socket.IO · `@nestjs/jwt`

## Veri Modeli (Mongoose)

`Ticket` (gömülü `Message[]` ile): ticketNumber, title, description, status, priority,
category, sentiment, customerId, assignedAgentId, messages, slaDeadline, resolutionNote,
resolvedAt, closedAt, rating/ratingComment/ratedAt, aiProcessed, assignmentSource,
reassignedAfterAi, aiCategory, categoryOverriddenAfterAi, priorityManuallySet,
aiConfidence, aiAssignedAt.

- `sentiment` (`OFKELI`/`NOTR`/`MEMNUN`): AI Service'in `ticket.analyzed` event'inden
  işlenir; temsilci ekranlarında renk/ikonla gösterilir (bkz. AI_APPROACH.md).
- `priorityManuallySet`: `true` ise sonraki AI analizleri bu talebin `priority`
  alanını artık ezmez (süpervizör kararı korunur).

## Endpoint'ler

Base path: `/api/v1/tickets` (Kong route'unda `jwt` plugin zorunlu, anonim erişim kapalı).
**Swagger/OpenAPI UI:** `http://localhost:8000/api/v1/tickets/docs`.

| Method | Path | Açıklama | Yetki |
|---|---|---|---|
| GET | `/health` | Docker healthcheck | Public |
| POST | `/` | Ticket oluşturur | JWT (herhangi bir kullanıcı) |
| GET | `/` | Tüm ticket'ları listeler (`?assignedAgentId=&status=&priority=&category=`) | JWT + personel (TEMSILCI/SUPERVIZOR/ADMIN) |
| GET | `/stats/dashboard` | Dashboard istatistikleri (durum/sentiment dağılımı, SLA uyumu, AI doğruluğu, memnuniyet) | JWT + SUPERVIZOR/ADMIN |
| GET | `/stats/team` | Temsilci bazlı takım performans tablosu | JWT + SUPERVIZOR/ADMIN |
| GET | `/completed` | Tamamlanan (KAPANDI/IPTAL) talepler log ekranı (`?take=&skip=`) | JWT + SUPERVIZOR/ADMIN |
| GET | `/auto-assignments` | AI'ın otomatik atadığı taleplerin akışı (`?take=`) | JWT + SUPERVIZOR/ADMIN |
| GET | `/customer/:customerId` | Bir müşterinin ticket'ları | JWT; müşteri sadece kendisininkini, personel herkesinkini görür |
| GET | `/:ticketNumber` | Tek ticket getirir | JWT; sahibi veya personel |
| PATCH | `/:ticketNumber/status` | Durum günceller (state machine kuralları uygular, ihlalde 422) | JWT; sahibi (sadece iptal) veya personel |
| PATCH | `/:ticketNumber/assign` | Temsilci manuel atar (AI atamasını override eder) | JWT + SUPERVIZOR |
| PATCH | `/:ticketNumber/category` | Kategori değiştirir (AI override; doğruluk metriğine yansır) | JWT; sahibi temsilci veya SUPERVIZOR |
| PATCH | `/:ticketNumber/priority` | Öncelik değiştirir (sonraki AI analizleri artık ezmez) | JWT + SUPERVIZOR |
| POST | `/:ticketNumber/rating` | Çözülmüş ticket'ı değerlendirir (1-5, tek seferlik) | JWT, sadece ticket sahibi |
| POST | `/:ticketNumber/messages` | Ticket'a mesaj ekler | JWT (sahibi veya personel) |
| GET | `/:ticketNumber/messages` | Mesaj thread'ini kronolojik sırayla getirir | JWT; sahibi veya personel |

### WebSocket

Path: `/api/v1/tickets/socket.io` (Kong prefix'iyle uyumlu özel path).
Auth: `handshake.auth.token` veya `?jwt=` query param ile JWT; client `user_{sub}`
odasına katılır.

Server → client event'leri: `ticket_created`, `new_ticket_arrived`,
`ticket_status_updated`, `assigned_ticket_updated`, `ticket_updated`, `new_message`,
`auto_assignment` (AI otomatik atama anı), `ticket_completed` (KAPANDI/IPTAL).
Tam payload örnekleri için bkz. [`EVENTS.md`](../EVENTS.md).

## RabbitMQ

**Yayınlanan event'ler:**

| Hedef kuyruk | Event | Ne zaman | Payload |
|---|---|---|---|
| `ai_analysis_queue` | `ticket.created` | Ticket oluşturulduğunda | `{ ticketId, title, description }` |
| `ai_analysis_queue` | `ticket.released` | Ticket çözüldü/iptal edildiğinde (temsilci kapasitesi serbest kalır) | `{ ticketId, agentId, resolved }` |
| `ai_analysis_queue` | `ticket.category_changed` | Personel kategoriyi AI önerisinden farklı değiştirdiğinde | `{ ticketId, aiCategory, newCategory, changedByRole }` |
| `ai_analysis_queue` | `ticket.rated` | Müşteri değerlendirme gönderdiğinde | `{ agentId, rating }` — atama formülündeki performans bileşenini günceller |
| `gamification_queue` | `ticket.resolved` | Durum → COZULDU olduğunda | `{ ticketId, agentId, slaMet }` |
| `gamification_queue` | `ticket.rated` | Müşteri değerlendirme gönderdiğinde | `{ ticketId, agentId, rating }` |

**Dinlenen event'ler** (queue: `ticket_updates_queue`):

| Event | Kaynak | Açıklama |
|---|---|---|
| `ticket.analyzed` | ai-service | `{ ticketId, category, confidence, sentiment, priority, assignedAgentId }` — AI analiz sonucunu ticket'a işler |

Tüm event payload'larının tam şeması ve örnekleri için bkz. [`EVENTS.md`](../EVENTS.md).

## Diğer Servislerle REST Bağımlılığı

Yalnızca yetkisiz erişim denemelerini / kritik durum değişikliklerini merkezi audit
log'a yazmak için identity-service'e senkron, fire-and-forget bir REST çağrısı yapılır
(`POST {IDENTITY_SERVICE_URL}/api/v1/auth/internal/audit`, `x-internal-key` header'ıyla
korunur). identity-service kapalıysa bu çağrı sessizce başarısız olur, ana akışı bloklamaz.

## Environment Değişkenleri

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `PORT` | HTTP port | `3002` |
| `MONGO_URI` | MongoDB bağlantı string'i | `mongodb://localhost:27017/ticket_db` |
| `RABBITMQ_URI` | AMQP broker URL (hem publisher hem consumer için) | `amqp://asistcell:asistcell_secret@localhost:5672` |
| `JWT_ACCESS_SECRET` | Gelen isteklerdeki/WS bağlantılarındaki JWT'yi doğrulamak için | — (zorunlu) |
| `IDENTITY_SERVICE_URL` | Audit log'u merkezi olarak yazmak için identity-service adresi | `http://identity-service:3001` |
| `INTERNAL_API_KEY` | identity-service'in internal audit endpoint'i için paylaşılan anahtar | — (boşsa audit yazımı atlanır) |

## Çalıştırma

`docker-compose.yml` içinde `ticket-service` + `ticket-mongo` + `rabbitmq`
bağımlılıklarıyla ayağa kalkar. Host'a port açmaz; Kong üzerinden
(`http://localhost:8000/api/v1/tickets/...`) erişilir.
