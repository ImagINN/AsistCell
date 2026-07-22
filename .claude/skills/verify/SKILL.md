---
name: verify
description: AsistCell mikroservis stack'ini Docker Compose ile ayağa kaldırıp Kong üzerinden e2e doğrulama tarifi
---

# AsistCell doğrulama tarifi

## Build & çalıştırma

Tüm stack Docker Compose ile döner; değişen servisi rebuild etmek yeterli:

```bash
docker compose up -d --build <servis-adı>   # identity-service | ticket-service | gamification-service | ai-service
docker compose ps                            # hepsi (healthy) olmalı, ~15sn bekle
```

- Prisma servisleri (identity, gamification) migration kullanmaz — container başlangıcında `prisma db push` şemayı senkronlar. Şema değişikliği = sadece rebuild.
- Lokal typecheck: `npx tsc --noEmit` (önce `npx prisma generate` gerekir; gamification'da `./node_modules/.bin/tsc` kullan, `npx tsc` yanlış paketi çeker).

## Sürme (drive)

Tüm istekler Kong üzerinden: `http://localhost:8000`. JWT zorunlu (auth route'ları hariç).

- Admin girişi: `.env` içindeki `ADMIN_EMAIL` / `ADMIN_PASSWORD` ile `POST /api/v1/auth/login` → `tokens.access_token`.
- Tipik akış: admin login → `POST /api/v1/auth/users` (TEMSILCI oluştur) → müşteri `register` → `POST /api/v1/tickets` → `PATCH .../assign` → temsilciyle `PATCH .../status` (ISLEMDE → COZULDU) → müşteriyle `POST .../rating` → `GET /api/v1/tickets/stats/dashboard` → `GET /api/v1/game/agents/:id`.
- Hazır uçtan uca script örneği scratchpad'de üretilmişti; aynı kalıpla `curl + jq` yaz, e-postaları `$(date +%s)` ile benzersizleştir.

## Dikkat

- AI servisi `ticket.created`'ı ~4sn'de işleyip `ticket.analyzed` yayınlar — atama/durum senaryolarında bu asenkron eventin **sonradan** geleceğini hesaba kat; doğrulamada birkaç saniye bekleyip ticket'ı tekrar GET'le.
- RabbitMQ eventleri (gamification puanları) için istekten sonra ~2sn bekle.
- Gamification history alanı `pointsChanged`'dır (`points` değil).
