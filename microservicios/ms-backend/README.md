# MS1 — ms-pacientes (Next.js + Prisma + GraphQL)

Microservicio **backend puro** (sin UI) dueño de **identidad/personal, pacientes, citas e historia clínica**.
Parte del refactor a microservicios de MediCloud (v3). Identidad compartida vía **Supabase** (`supabase_uid` es la llave universal entre servicios).

## Stack
- **Next.js** (App Router) — solo route handlers bajo `src/app/api/*`
- **Prisma** + **PostgreSQL** local (`ms_pacientes` en `localhost:5432`)
- **graphql-yoga** en `/api/graphql`
- **jose** para verificar el JWT de Supabase (ES256/RS256) contra JWKS

## Correr en local

```bash
cd services/ms-pacientes
cp .env.example .env        # ya viene un .env con valores locales
npm install
npx prisma migrate dev --name init   # crea las tablas en ms_pacientes
npm run seed                          # datos demo (UUIDs alineados con MS3)
npm run dev                           # http://localhost:3000/api/graphql
```

> La base `ms_pacientes` ya debe existir en el Postgres nativo (`localhost:5432`, `postgres/postgres`).

## Endpoints
- **GraphQL**: `POST http://localhost:3000/api/graphql` (GraphiQL en GET con navegador)
- **REST interno**: `GET /api/internal/pacientes/by-uid/{supabaseUid}` → `{ id }` — lo consume el `PacienteClient` de MS3.

## Modelo de datos
`rol`, `usuario`, `paciente`, `cita`, `historia_clinica`, `episodio` (FKs internas reales). Ver `prisma/schema.prisma`.

## Auth y roles
El rol viene en el JWT de Supabase (`app_metadata.role`). El frontend oculta por rol; **cada resolver bloquea de verdad**.
Un PACIENTE solo accede a sus propios datos (se filtra por `supabase_uid`).

## Operaciones GraphQL
- **Queries**: `me`, `usuarios`, `pacientes(q)`, `paciente(id)`, `citas`, `misCitas`, `historiaPorPaciente(pacienteId)`
- **Mutations**: `crearPaciente`, `actualizarPaciente`, `crearCita`, `crearEpisodio`, `cambiarRolUsuario`

> `crearCita` es la puerta que también usará n8n (WhatsApp → cita) en una fase posterior.
