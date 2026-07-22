# ── Build Stage ─────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Önce bağımlılıkları kopyala (cache optimizasyonu)
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Prisma client oluştur
RUN npx prisma generate

# Kaynak kodu kopyala ve derle
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ── Production Stage ─────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Sadece production bağımlılıkları
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev

# Prisma client ve şema
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/

# Derlenmiş uygulama
COPY --from=builder /app/dist ./dist

EXPOSE 3001

# Şemayı veritabanına senkronla (migrations klasörü yok — db push), sonra uygulamayı başlat
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main"]
