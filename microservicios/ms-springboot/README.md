# ms-gestion — Backend de Gestión (Spring Boot + GraphQL)

Backend Java 17 / Spring Boot 3 con GraphQL para los dominios:
- Inventario de farmacia (medicamentos, lotes, movimientos)
- Facturación / caja
- Recetas médicas (con integración a ms-blockchain)
- Usuarios y autenticación (Supabase JWT)
- BI (resolvers sobre vistas SQL)

## Cómo arrancar localmente

```powershell
# 1. Asegurar Postgres dockerizado corriendo
cd ..\..\
docker compose up -d postgres
cd services\ms-gestion

# 2. (Opcional) Configurar Supabase en .env del monorepo (raíz)
#    Si SUPABASE_JWKS_URI esta vacio, ms-gestion arranca en modo DEV sin auth
#    (todo es permitAll para que GraphiQL funcione sin token).

# 3. Arrancar (necesita JDK 17). Maven wrapper se descarga solo:
.\mvnw spring-boot:run
```

Abrir: http://localhost:8080/graphiql

## Comandos útiles

```powershell
# Empaquetar
.\mvnw clean package -DskipTests

# Tests
.\mvnw test

# Limpiar
.\mvnw clean

# Verificar migraciones aplicadas
docker exec -it clinica_postgres psql -U clinica -d ms_gestion -c "select * from flyway_schema_history order by installed_rank desc limit 5;"
```

## Estructura

```
src/main/java/com/clinica/gestion/
├── GestionApplication.java
├── config/        GraphQlConfig, CorsConfig, WebClientConfig, SecurityConfig
├── common/        excepciones, GraphQlExceptionHandler, UsuarioContext (ThreadLocal)
├── security/      SupabaseJwtConverter, UsuarioContextFilter
├── usuario/       Usuario, Rol, RolEnum + service + GraphQL controller
├── paciente/      Paciente (referencia minima)
├── categoria/     Categoria
├── proveedor/     Proveedor
├── medicamento/   Medicamento
├── inventario/    Lote, MovimientoInventario, InventarioService (FIFO)
├── factura/       Factura, DetalleFactura, FacturaService (transaccion critica)
├── receta/        Receta, DetalleReceta, RecetaService + BlockchainClient + reintentos
└── bi/            Entidades read-only de vistas SQL + BiController GraphQL
```

## Esquema GraphQL

Archivos modulares en `src/main/resources/graphql/`:
- `schema.graphqls` (raíz: scalars, types comunes)
- `usuario.graphqls`
- `paciente.graphqls`
- `inventario.graphqls`
- `factura.graphqls`
- `receta.graphqls`
- `bi.graphqls`

## Modos de ejecución

| Modo | Cómo activar | Comportamiento |
|---|---|---|
| Dev sin auth | `SUPABASE_JWKS_URI` vacío | Todo es `permitAll`; GraphiQL accesible sin token. Útil para CRUD inicial. |
| Dev con Supabase | `SUPABASE_JWKS_URI=https://xxx.supabase.co/auth/v1/.well-known/jwks.json` | JWT requerido. `@PreAuthorize` activo. Usuario local se crea on-the-fly al primer login (lazy provisioning). |
| Prod | `SPRING_PROFILES_ACTIVE=prod` + Supabase configurado | Como dev con Supabase + GraphiQL deshabilitado. |

## Variables de entorno

Ver `.env.example` en la raíz del monorepo.
