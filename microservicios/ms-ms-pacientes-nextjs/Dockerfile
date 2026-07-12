# ============================================================
# MS1 - ms-backend (Next.js 15 + Prisma + GraphQL) - Puerto 3000
# Build multi-etapa optimizado para AKS
# ============================================================

# --- Etapa 1: dependencias ---
FROM node:20-alpine AS deps
WORKDIR /app
# prisma/ debe copiarse antes de npm ci porque el postinstall ejecuta "prisma generate"
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# --- Etapa 2: build ---
FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Regenera el cliente Prisma para la plataforma del contenedor y compila Next.js
RUN npx prisma generate && npm run build

# --- Etapa 3: runtime ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# La salida "standalone" incluye node_modules trazados (Prisma incluido)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Esquema Prisma disponible en runtime (migrate deploy / introspección)
COPY --from=build /app/prisma ./prisma

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
