FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files AND prisma schema first
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# ⬇️ ADD THIS: Generate Prisma Client before building
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:18-alpine AS production

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# ⬇️ ADD THIS: Also need generated client in production stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN mkdir -p logs

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]