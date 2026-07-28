# Seeds de datos (repoblado de las bases locales)

Dos archivos SQL para poblar las bases `ms_pacientes` y `ms_gestion` con datos de demo
(300 pacientes, 500 citas, 40 medicamentos, 300 facturas, etc.).

Los `usuario` se recrean con los **UUID reales de Supabase Auth**, así que los logins
existentes (`admin1@clinica.com`, etc.) siguen funcionando con sus contraseñas de Supabase.

Como `ms_gestion` referencia pacientes/cajeros de `ms_pacientes` por UUID (sin FK entre
bases), **ambos archivos comparten los mismos UUID**: hay que correr los dos.

## Requisito previo
Las tablas deben existir antes de correr los seeds:
- `ms_gestion`  -> las crea Flyway al arrancar `ms-gestion`.
- `ms_pacientes` -> `npx prisma migrate deploy` (o arrancar el contenedor `ms-pacientes`).

## Ejecutar
```bash
psql "postgresql://postgres:postgres@localhost:5432/ms_pacientes" -f seeds/seed_ms_pacientes.sql
psql "postgresql://postgres:postgres@localhost:5432/ms_gestion"   -f seeds/seed_ms_gestion.sql
```

Los seeds empiezan con `TRUNCATE`, así que son re-ejecutables (limpian antes de insertar).
