#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# AsistCell — Tek Komutla Başlatma
# Kullanım: ./start.sh [--no-build]
# ──────────────────────────────────────────────────────────────────────────────
set -e

ADMIN_PANEL_URL="http://localhost:3000"
BUILD_FLAG="--build"

# --no-build bayrağı ile imaj yeniden oluşturma atlanır (hız için)
if [[ "$1" == "--no-build" ]]; then
  BUILD_FLAG=""
  echo "ℹ️  --no-build: Mevcut imajlar kullanılacak."
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           🚀  AsistCell Başlatılıyor...              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Docker Compose'u başlat (detached mod — arka planda çalışır)
docker compose up $BUILD_FLAG -d

echo ""
echo "⏳ Admin Panel hazır olana kadar bekleniyor..."
echo "   (Servisler ilk kez başlatılıyorsa bu 60-120 saniye sürebilir)"
echo ""

# Admin Panel sağlık kontrolü: http://localhost:3000 cevap verene kadar bekle
TIMEOUT=180   # maksimum bekleme süresi (saniye)
ELAPSED=0
INTERVAL=5

while true; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$ADMIN_PANEL_URL" 2>/dev/null || echo "000")

  if [[ "$STATUS" == "200" ]]; then
    echo "✅ Admin Panel hazır!"
    break
  fi

  if [[ $ELAPSED -ge $TIMEOUT ]]; then
    echo "⚠️  $TIMEOUT saniye içinde hazır olmadı."
    echo "   Logları kontrol et: docker compose logs -f admin-panel"
    break
  fi

  echo "   [$ELAPSED/$TIMEOUT s] Bekleniyor... (HTTP $STATUS)"
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""
echo "🌐 Tarayıcı açılıyor: $ADMIN_PANEL_URL"
echo ""

# macOS: open | Linux: xdg-open | Windows (WSL): cmd.exe /c start
if command -v open &>/dev/null; then
  open "$ADMIN_PANEL_URL"
elif command -v xdg-open &>/dev/null; then
  xdg-open "$ADMIN_PANEL_URL"
elif command -v cmd.exe &>/dev/null; then
  cmd.exe /c start "$ADMIN_PANEL_URL"
else
  echo "   Tarayıcı otomatik açılamadı. Şu adrese git: $ADMIN_PANEL_URL"
fi

echo "──────────────────────────────────────────────────────"
echo "  Admin Panel   → http://localhost:3000"
echo "  Kong Proxy    → http://localhost:8000"
echo "  Kong Admin    → http://localhost:8001"
echo "  RabbitMQ UI   → http://localhost:15672"
echo "──────────────────────────────────────────────────────"
echo ""
echo "📋 Logları izlemek için:"
echo "   docker compose logs -f"
echo ""
echo "🛑 Durdurmak için:"
echo "   docker compose down"
echo ""
