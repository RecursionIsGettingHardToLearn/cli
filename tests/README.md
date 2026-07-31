# Tests — Sistema de Gestión Clínica

Carpeta exclusiva para las pruebas del sistema. Organizada en dos niveles:

```
tests/
├── unitarias/
│   ├── ms_diagnostico_ia/      # pytest — Python (ia_common, storage helpers)
│   ├── ms_gestion/             # JUnit 5 + Mockito — Java (FacturaService, MedicamentoService)
│   ├── ms_pacientes_bff/       # Jest/TypeScript — resolvers GraphQL
│   └── frontend/               # Jest/Angular — DiagnosticoComponent
└── integracion/
    ├── graphql_bff/            # Jest — endpoint real /api/graphql
    ├── rest_ms_gestion/        # Jest — endpoints REST de Spring Boot
    └── ms_diagnostico_ia/      # pytest — endpoints FastAPI con TestClient
```

---

## Pruebas Unitarias

### ms-diagnostico-ia (Python / pytest)
```bash
cd microservicios/ms-diagnostico-ia
pip install pytest pydantic pydantic-settings
pytest ../../tests/unitarias/ms_diagnostico_ia/ -v
```
Cubre: `json_from_text`, `safe_float`, `safe_urgency`, `safe_string_list`,
`build_image_result`, `_normalizar_probabilidades`, `DocumentoRecord`,
`ResultadoRecord`, `_iso`, `_parse_datetime`, `_new_id`, `_uses_dynamodb`.

### ms-gestion (Java / JUnit 5 + Mockito)
```bash
cd microservicios/ms-springboot-gestion
mvn test -Dtest="FacturaServiceTest,MedicamentoServiceTest"
```
Cubre: cálculo de subtotal/total, descuentos, validaciones de negocio
(`BusinessException`), anulación de facturas, desactivación de medicamentos,
medicamentos controlados.

### ms-pacientes BFF (TypeScript / Jest)
```bash
cd microservicios/ms-ms-pacientes-nextjs
npm install
npx jest ../../tests/unitarias/ms_pacientes_bff/ --passWithNoTests
```
Cubre: `requireRole` (UNAUTHENTICATED / FORBIDDEN), filtro `soloConCuenta`,
`crearPaciente`, `crearCita`, `notificarResultado` (sin token push).

### Frontend Angular (Jest)
```bash
cd frontend
npm install
npx jest ../../tests/unitarias/frontend/ --passWithNoTests
```
Cubre: `DiagnosticoComponent` — validación antes de analizar, estado de carga,
`tipoDe` (tipo "Otro"), notificar (sin paciente / con token / sin token),
independencia entre los dos análisis.

---

## Pruebas de Integración

> **Requieren los servicios levantados localmente** (`docker compose up -d`).

### BFF GraphQL
```bash
BFF_URL=http://localhost:3000/api/graphql \
BFF_ADMIN_TOKEN=<jwt_admin> \
npx jest tests/integracion/graphql_bff/ --testTimeout=15000 --runInBand
```

### ms-gestion REST
```bash
MS_GESTION_URL=http://localhost:8080 \
MS_GESTION_TOKEN=<jwt_admin> \
npx jest tests/integracion/rest_ms_gestion/ --testTimeout=15000 --runInBand
```

### ms-diagnostico-ia FastAPI (TestClient, sin Docker)
```bash
cd microservicios/ms-diagnostico-ia
pip install pytest httpx
OPENAI_API_KEY=sk-test STORAGE_BACKEND=sqlite \
pytest ../../tests/integracion/ms_diagnostico_ia/ -v --tb=short
```

---

## Notas

- Las pruebas unitarias **no** necesitan ningún servicio levantado (usan mocks/stubs).
- Las pruebas de integración utilizan **datos reales del seed** (`seeds/`).
- El resultado (pass/fail) depende de que el entorno esté configurado;
  los tests están escritos para documentar el contrato de cada módulo.
