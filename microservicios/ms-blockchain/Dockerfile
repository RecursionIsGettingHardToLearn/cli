# ============================================================
# ms-blockchain (Node.js/Express + ethers, Polygon Amoy) - Puerto 3001
# Solo dependencias de produccion; hardhat queda fuera del runtime
# ============================================================

# --- Etapa 1: dependencias de produccion ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Etapa 2: runtime ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup -S nodejs && adduser -S blockchain -G nodejs

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# ABIs de contratos compilados y direcciones desplegadas en Amoy
COPY artifacts ./artifacts
COPY deployments ./deployments

USER blockchain
EXPOSE 3001
CMD ["node", "src/server.js"]
