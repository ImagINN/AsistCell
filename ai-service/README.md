# ai-service

Yapay zeka destekli ticket analizi: kategori/duygu/öncelik sınıflandırması ve
uygun temsilciye otomatik atama. **Hibrit yaklaşım** kullanılır:

1. **Birincil — LLM (Google Gemini):** kategori + güven skoru (0.0-1.0) + sentiment üretir.
2. **Fallback — kendi veri setimizle eğitilmiş yerel ML modeli (TF-IDF + Logistic
   Regression):** Gemini erişilemezse (API çökük, limitli, circuit breaker açık)
   sınıflandırmayı tamamen çevrimdışı yerel model yapar; sentiment bu modda kural
   tabanlı (Türkçe öfke/memnuniyet anahtar kelimeleri) belirlenir.

Her iki motorda da aynı kural geçerlidir: **güven skoru < 0.60 ise kategori
`BELIRSIZ` döner ve talep manuel atama kuyruğuna düşer** (otomatik temsilci
ataması yapılmaz, süpervizör manuel atar).

## Model Eğitimi (kendi veri setimiz)

- **Veri seti:** [`data/training_data.csv`](data/training_data.csv) — kendi
  oluşturduğumuz, elle etiketlenmiş **150 gerçekçi Türkçe talep metni**
  (kategori başına 30 örnek; FATURA, SEBEKE, CIHAZ, TARIFE, IPTAL).
  Format: `text,category`. Örnekler günlük konuşma dilinde, gerçek çağrı merkezi
  senaryolarından esinlenerek yazıldı (örn. *"Faturam bu ay iki katı geldi,
  açıklama istiyorum"*, *"Evde çekim gücü çok düşük, sürekli kesiliyor"*).
- **Mimari:** `TfidfVectorizer` (karakter 3-5 gram, `char_wb`, sublinear TF) →
  `LogisticRegression` (C=5). Karakter n-gram'ları Türkçe'nin sondan eklemeli
  yapısında kelime n-gram'larından belirgin iyi sonuç verdi (5-fold CV: 0.913'e
  karşı 0.727). Güven skoru `predict_proba`'nın en yüksek sınıf olasılığıdır —
  0.0-1.0 aralığında, LLM'inkiyle aynı sözleşme.
- **Eğitim süreci:** `python scripts/train_model.py`
  1. CSV yüklenir, 5-katlı çapraz doğrulama ile genel doğruluk raporlanır,
  2. %80/%20 stratified split üzerinde test doğruluğu + sınıf bazlı
     precision/recall raporlanır,
  3. Nihai model tüm veriyle eğitilip `app/ml/model.joblib`'e kaydedilir.
- **Yeniden eğitim:** `data/training_data.csv`'ye örnek ekleyip scripti tekrar
  çalıştırmak yeterli. Docker imajı build edilirken eğitim otomatik çalışır
  (`Dockerfile` içindeki `RUN python scripts/train_model.py`), model imaja gömülür.
- **Doğruluk takibi:** Personel bir talebin kategorisini değiştirdiğinde
  ticket-service `ticket.category_changed` event'i yayınlar; bu servis düzeltmeyi
  `analysis_logs.corrected_category`'ye işler ve `/stats` endpoint'i canlı
  `accuracy_rate` raporlar.

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
(RabbitMQ) · `google-generativeai` (Gemini) · `scikit-learn` (yerel TF-IDF +
Logistic Regression sınıflandırıcısı) · `tenacity`

## Veri Modeli (SQLAlchemy)

- `Agent`: id, name, email, expertise, active_ticket_count, max_capacity, performance_score, is_active
- `AnalysisLog`: id, ticket_id, category, confidence, sentiment, priority,
  assigned_agent_id, manual_queue, fallback_used, fallback_reason

## Endpoint'ler

Base path: `/api/v1/ai` (Kong route'unda `jwt` plugin zorunlu; servisin kendisi
ayrıca lokal bir auth kontrolü yapmaz, doğrulama tamamen Kong'da yapılır).
**Swagger/OpenAPI UI:** `http://localhost:8000/api/v1/ai/docs` (ReDoc: `/api/v1/ai/redoc`).

| Method | Path | Açıklama |
|---|---|---|
| POST | `/analyze` | Ticket'ı sınıflandırır ve temsilci atama önerisi üretir (Gemini + circuit breaker fallback) |
| GET | `/analysis/{ticket_id}` | Bir talebin en güncel AI analiz sonucunu döner (kategori, güven, sentiment, öncelik) |
| GET | `/health` | Servis sağlığı + circuit breaker durumu/hata sayısı |
| GET | `/stats` | Toplam analiz sayısı, fallback sayısı, manuel kuyruğa düşen sayısı, kategori/sentiment dağılımı, doğruluk oranı |
| POST | `/agents` | Yeni temsilci (agent) kaydı oluşturur (identity-service tarafından senkronize edilir) |
| GET | `/agents` | Temsilcileri isme göre listeler |
| PATCH | `/agents/{agent_id}` | Temsilci bilgilerini günceller |

## RabbitMQ

**Dinlenen event'ler** (queue: `ai_analysis_queue`, gönderen: ticket-service):

| Event | Payload | Davranış |
|---|---|---|
| `ticket.created` | `{ ticketId, title, description }` | Analizi çalıştırır, sonucu `ticket.analyzed` ile geri yayınlar |
| `ticket.released` | `{ ticketId, agentId, resolved }` | İlgili temsilcinin `active_ticket_count`'unu azaltır; ardından kapasitesizlik yüzünden manuel kuyrukta bekleyen talepleri tekrar atamayı dener (`ticket.analyzed` ile yeniden yayınlanır) |
| `ticket.category_changed` | `{ ticketId, aiCategory, newCategory, changedByRole }` | Personel kategori düzeltmesini `analysis_logs.corrected_category`'ye işler (doğruluk metriği) |
| `ticket.rated` | `{ agentId, rating }` | Temsilcinin `average_rating`'ini günceller — akıllı atama formülündeki *performans* bileşeni buradan türetilir |

**Yayınlanan event'ler** (routing key: `ticket_updates_queue`, tüketen: ticket-service):

| Event | Payload |
|---|---|
| `ticket.analyzed` | `{ ticketId, category, confidence, sentiment, priority, assignedAgentId }` |

Tüm event payload'larının tam şeması ve örnekleri için bkz. [`EVENTS.md`](../EVENTS.md).
Yaklaşım/model seçimi ve akıllı atama formülünün tam gerekçesi için bkz. [`AI_APPROACH.md`](../AI_APPROACH.md).

## Diğer Servislerle REST Bağımlılığı

Bu servis kendi başına başka bir servise senkron REST çağrısı yapmaz. Ancak
identity-service, bir TEMSILCI hesabı oluşturulduğunda/güncellendiğinde bu
servisin `/api/v1/ai/agents` endpoint'ine senkron, fire-and-forget bir REST
çağrısıyla atama havuzunu senkron tutar (bkz. [identity-service README](../identity-service/README.md)).

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
