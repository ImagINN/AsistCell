FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npm run prisma:generate

COPY . .

RUN npm run build

EXPOSE 3004

CMD ["sh", "-c", "npx prisma db push && npm run start:prod"]
