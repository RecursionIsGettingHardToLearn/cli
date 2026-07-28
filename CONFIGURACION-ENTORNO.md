# 🔧 Configuración del Entorno — Clínica (Docker)

> Documento de referencia para **no adivinar** qué `.env` y qué comunicación
> entre servicios deja el sistema funcionando. Estado verificado al
> **2026-06-09**. Si recreas el entorno desde cero, copia los `.env` de aquí.

---

## 1. Resumen de servicios y puertos

| Servicio        | Imagen / Stack                     | Puerto host | URL local                                   |
|-----------------|------------------------------------|-------------|---------------------------------------------|
| `frontend`      | Angular (node:20-alpine)           | 4200        | http://localhost:4200                       |
| `backend`       | Next.js / BFF (node:20-alpine)     | 3000        | http://localhost:3000/api/graphql           |
| `springboot`    | Java 21 / Gestión (maven)          | 8080        | http://localhost:8080/graphiql              |
| `ms-blockchain` | Node.js / Polygon Amoy             | 3001        | http://localhost:3001/health                |
| `n8n`           | Automatización                     | 5678        | http://localhost:5678 (admin/clinica2025)   |
| `evolution`     | WhatsApp Gateway                   | 8081        | http://localhost:8081                       |
| `evolution-db`  | PostgreSQL 15 (interno Evolution)  | —           | (solo red interna)                          |

---

## 2. Comunicación entre microservicios

**Regla clave:** dentro de Docker los contenedores se hablan **por nombre de
servicio**, NO por `localhost`. Solo se exponen al host los puertos que abres
desde el navegador.

```
                       ┌──────────────┐
   navegador ─4200──▶  │   frontend   │
                       │   (Angular)  │
                       └──────┬───────┘
                              │ http://localhost:3000/api/graphql (desde el navegador)
                              ▼
                       ┌──────────────┐
   navegador ─3000──▶  │   backend    │  Next.js BFF
                       │              │
                       └──┬────────┬──┘
        MS3_URL=          │        │  BLOCKCHAIN_URL=
http://springboot:8080/   │        │  http://ms-blockchain:3001
graphql                   ▼        ▼
              ┌──────────────┐   ┌──────────────┐
              │  springboot  │──▶│ ms-blockchain│  (registra recetas on-chain)
              │  (Gestión)   │   │ Polygon Amoy │
              └──────────────┘   └──────────────┘
                BLOCKCHAIN_URL=http://ms-blockchain:3001
```

Variables de comunicación (las inyecta `docker-compose.yml`, **sobrescriben**
lo que diga el `.env`):

- `backend`  → `MS3_URL=http://springboot:8080/graphql`
- `backend`  → `BLOCKCHAIN_URL=http://ms-blockchain:3001`
- `springboot` → `BLOCKCHAIN_URL=http://ms-blockchain:3001`
- `evolution` → `DATABASE_CONNECTION_URI=postgresql://evolution:evolution2025@evolution-db:5432/evolution`

> ⚠️ Los `.env` de cada subcarpeta (`backend/.env`, `springboot/.env`) traen
> `localhost`/perfiles locales nativos. **Para Docker manda el `.env` de la
> raíz**, que es el que leen `backend` y `springboot` vía `env_file: - .env`.

---

## 3. Archivos `.env` que usa Docker

### 3.1 `/.env` (RAÍZ) — lo leen `backend` y `springboot`

```dotenv
# ----- PACIENTES (Next.js + Prisma / ms_pacientes) -----
DATABASE_URL="postgresql://postgres.qobedozcifsrfdoktwrv:8FLiKvwU8z%40MJ3%40@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.qobedozcifsrfdoktwrv:8FLiKvwU8z%40MJ3%40@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

# ----- GESTION (Spring Boot / ms_gestion) -----
DB_URL=jdbc:postgresql://aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
DB_USER=postgres.qobedozcifsrfdoktwrv
DB_PASS=8FLiKvwU8z@MJ3@
SPRING_PROFILES_ACTIVE=dev

# ----- SUPABASE AUTH (compartido, proyecto yiyfwfvxdseamnelgetf) -----
SUPABASE_ISSUER=https://yiyfwfvxdseamnelgetf.supabase.co/auth/v1
SUPABASE_JWKS_URI=https://yiyfwfvxdseamnelgetf.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpeWZ3ZnZ4ZHNlYW1uZWxnZXRmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTk1NTgzMCwiZXhwIjoyMDk1NTMxODMwfQ.E8r-AMg-PKEG2PtoEU_WlJ1-XMU9-PYEKfFAeQpDui8

# ----- Integracion entre microservicios -----
PACIENTES_URL=http://localhost:3000
PACIENTES_ENABLED=true
BLOCKCHAIN_ENABLED=true
CORS_ORIGINS=http://localhost:4200,http://localhost:8081

# ----- Stripe (pagos / ms_gestion) -----
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# ----- Otros (PORT lo sobreescribe compose por servicio) -----
MS3_URL=http://localhost:8080/graphql

# ----- BLOCKCHAIN (ms-blockchain / Polygon Amoy) -----
AMOY_RPC_URL=https://polygon-amoy.drpc.org
PRIVATE_KEY=0x1fc9a4224509d2757b6da2eb900b65831385de9f0fd275a0449e5681dbb56fa0
CONTRACT_ADDRESS=0xBa43Cc53c22851505179e0163A24E77681374805
```

### 3.2 `/block_movil/ms-blockchain/.env` — lo lee `ms-blockchain`

```dotenv
PORT=3001
CORS_ORIGINS=http://localhost:4200,http://localhost:8080
SUPABASE_JWKS_URI=

# Perfil ACTIVO: Polygon Amoy (nube). Contrato ya desplegado.
AMOY_RPC_URL=https://polygon-amoy.drpc.org
PRIVATE_KEY=0x1fc9a4224509d2757b6da2eb900b65831385de9f0fd275a0449e5681dbb56fa0
CONTRACT_ADDRESS=0xBa43Cc53c22851505179e0163A24E77681374805
```

---

## 4. Cómo levantar todo (Docker)

Desde la carpeta raíz (donde está `docker-compose.yml`):

```powershell
# Construir y levantar todo en segundo plano
docker compose up -d

# Ver logs en vivo
docker compose logs -f

# Apagar
docker compose down
```

> Primera vez: tarda varios minutos (descarga imágenes Node/Java/Maven e instala
> dependencias). El servicio `springboot` tiene healthcheck; `backend` y `n8n`
> esperan a que esté `healthy`.

### Verificación rápida una vez arriba
- Frontend:   http://localhost:4200
- Backend BFF: http://localhost:3000/api/graphql
- Java:       http://localhost:8080/graphiql
- Blockchain: http://localhost:3001/health
- n8n:        http://localhost:5678  (admin / clinica2025)

---

## 5. App móvil (fuera de Docker)

`block_movil/mobile-rn` corre con Expo aparte (necesita IP LAN):

```powershell
cd block_movil/mobile-rn
npm install
npm start
```
Editar `app.json → expo.extra` reemplazando la IP por la LAN real
(`ipconfig | findstr IPv4`):
- `graphqlUrl`   → `http://<IP_LAN>:3000/api/graphql`
- `blockchainUrl`→ `http://<IP_LAN>:3001`

Firewall (si el teléfono no conecta):
```powershell
New-NetFirewallRule -DisplayName "Clinica-Dev" -Direction Inbound -LocalPort 4200,8080,3001,3000 -Protocol TCP -Action Allow
```

---

## 6. ⚠️ Notas de seguridad (importante)

Estos archivos `.env` contienen **secretos reales** (claves Supabase service_role,
PRIVATE_KEY de wallet, contraseñas de BD). Están en `.gitignore` — **no los subas
al repo**. Este documento los duplica solo como referencia interna del equipo;
si el repo es público, considera rotar estas credenciales.
