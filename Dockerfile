FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS production

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p logs

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
