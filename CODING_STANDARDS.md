# Estándares de Codificación — MediCloud

> **Versión:** 1.0.0 | **Fecha:** 2026-07-31 | **Autor:** Equipo MediCloud

---

## Índice

1. [Propósito y alcance](#1-propósito-y-alcance)
2. [Convenciones generales](#2-convenciones-generales)
3. [TypeScript / JavaScript (Next.js · Node · React Native)](#3-typescript--javascript-nextjs--node--react-native)
4. [Java (Spring Boot)](#4-java-spring-boot)
5. [Python (FastAPI)](#5-python-fastapi)
6. [Solidity (Smart Contract)](#6-solidity-smart-contract)
7. [Estilos CSS / Angular](#7-estilos-css--angular)
8. [GraphQL (schemas y resolvers)](#8-graphql-schemas-y-resolvers)
9. [Base de datos y Prisma ORM](#9-base-de-datos-y-prisma-orm)
10. [Git y control de versiones](#10-git-y-control-de-versiones)
11. [Pruebas](#11-pruebas)
12. [Seguridad](#12-seguridad)
13. [Documentación en código](#13-documentación-en-código)

---

## 1. Propósito y alcance

Este documento define los estándares de codificación obligatorios para el repositorio
`RecursionIsGettingHardToLearn/cli`, que contiene el sistema de gestión clínica **MediCloud**:
microservicios `ms-ms-pacientes-nextjs`, `ms-springboot-gestion`, `ms-blockchain` y
`ms-diagnostico-ia`, el frontend Angular 18 y la aplicación React Native con Expo.

Todos los miembros del equipo deben seguir estas reglas antes de abrir un Pull Request.
El incumplimiento de un estándar marcado **[OBLIGATORIO]** bloquea el merge.

---

## 2. Convenciones generales

| Aspecto | Regla |
|---|---|
| Encoding | UTF-8 en todos los archivos fuente |
| Saltos de línea | LF (`\n`). Configurar `.gitattributes` con `* text=auto eol=lf` |
| Indentación | 2 espacios — TypeScript, JavaScript, JSON, GraphQL, Angular HTML |
| Indentación | 4 espacios — Java, Python |
| Largo máximo de línea | 120 caracteres (TypeScript/Java/Python) |
| Trailing whitespace | Prohibido. Configurar el editor para eliminarlo al guardar |
| Archivo vacío al final | Cada archivo debe terminar con exactamente **una** línea en blanco |
| Idioma del código | Inglés (variables, funciones, clases, comentarios técnicos) |
| Idioma de mensajes UI | Español (labels, mensajes de error para el usuario final) |

### 2.1 Archivos de configuración obligatorios

Cada microservicio debe incluir:

```
.editorconfig
.eslintrc.json   (TS/JS)  |  .flake8 / pyproject.toml  (Python)  |  checkstyle.xml (Java)
.prettierrc      (TS/JS)
```

---

## 3. TypeScript / JavaScript (Next.js · Node · React Native)

### 3.1 Nomenclatura

| Elemento | Estilo | Ejemplo |
|---|---|---|
| Variable / función | `camelCase` | `crearCita`, `medicoMenosCargado` |
| Constante inmutable | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Clase / Interfaz | `PascalCase` | `CitaInput`, `RecetaService` |
| Archivo fuente | `kebab-case` | `crear-cita.resolver.ts` |
| Enum | `PascalCase` con valores `UPPER_SNAKE_CASE` | `EstadoCita.AGENDADA` |
| Tipo genérico | Una letra mayúscula | `T`, `K`, `V` |

### 3.2 TypeScript estricto **[OBLIGATORIO]**

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

- Prohibido usar `any` excepto en adaptadores de terceros donde sea imposible tiparlo.
  Documentar con `// eslint-disable-next-line @typescript-eslint/no-explicit-any` y una justificación.
- Preferir `interface` sobre `type` para definir contratos de objetos.
- Usar `readonly` en propiedades que no deben mutar.

### 3.3 Imports

```typescript
// ✅ Orden obligatorio (separados por línea en blanco):
// 1. Módulos de Node / externos
import { GraphQLError } from 'graphql';
import type { PrismaClient } from '@prisma/client';

// 2. Módulos internos del proyecto
import { requireRole } from '@/lib/auth';
import { sendExpoPush } from '@/lib/push';

// 3. Tipos
import type { Actor, Rol } from '@/lib/auth';
```

- Prohibido importar con rutas relativas de más de dos niveles (`../../..`).
  Usar alias de `tsconfig.json` (`@/`).

### 3.4 Funciones y arrow functions

```typescript
// ✅ Función nombrada para lógica de negocio
async function crearCita(
  _parent: unknown,
  args: CitaInput,
  ctx: Context,
): Promise<Cita> {
  const actor = requireRole(ctx, 'ADMINISTRADOR', 'MEDICO', 'PACIENTE');
  // …
}

// ✅ Arrow function solo para callbacks cortos
const esFuturo = (fecha: Date): boolean => fecha.getTime() > Date.now();
```

### 3.5 Manejo de errores

```typescript
// ✅ Siempre tipado
try {
  await blockchainClient.emitir(receta);
} catch (err: unknown) {
  if (err instanceof Error) {
    logger.warn(`Fallo blockchain: ${err.message}`);
  }
}

// ❌ Prohibido
} catch (e) { console.log(e) }
```

### 3.6 Async / Await

- Usar `async/await` en lugar de `.then().catch()`.
- Todo `await` debe estar dentro de un bloque `try/catch` o propagarse explícitamente.
- Prohibido `void` en promises sin manejar, salvo fire-and-forget documentado.

---

## 4. Java (Spring Boot)

### 4.1 Nomenclatura

| Elemento | Estilo | Ejemplo |
|---|---|---|
| Paquete | `lowercase.separado.por.puntos` | `com.clinica.gestion.receta` |
| Clase / Interfaz | `PascalCase` | `RecetaService`, `FacturaRepository` |
| Método | `camelCase` | `emitirReceta()`, `descontarFIFO()` |
| Constante | `UPPER_SNAKE_CASE` | `MAX_LOTES_FIFO` |
| Variable local | `camelCase` | `totalDisponible` |

### 4.2 Anotaciones y estilo **[OBLIGATORIO]**

```java
// ✅ Lombok obligatorio para reducir boilerplate
@Service
@RequiredArgsConstructor
@Slf4j
public class RecetaService {

    private final RecetaRepository recetaRepository;
    private final BlockchainClient blockchainClient;

    @Transactional
    public Receta emitir(RecetaInput input) {
        // Lógica de negocio
    }
}
```

- Usar `@Slf4j` para logging. Prohibido `System.out.println`.
- Todos los métodos de servicio que modifican datos deben llevar `@Transactional`.
- Inyección de dependencias **solo por constructor** (nunca `@Autowired` en campo).

### 4.3 Manejo de excepciones

```java
// ✅ Lanzar excepciones tipadas del dominio
public Lote findLoteById(UUID id) {
    return loteRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Lote no encontrado: " + id));
}

// ✅ BusinessException para reglas de negocio
if (cantidad <= 0) {
    throw new BusinessException("La cantidad debe ser positiva");
}
```

### 4.4 Checkstyle

Usar el perfil Google Java Style con las siguientes modificaciones:
- Largo máximo de línea: 120 caracteres.
- Espacios en blanco: 4 spaces, sin tabs.

---

## 5. Python (FastAPI)

### 5.1 Nomenclatura (PEP 8 estricto)

| Elemento | Estilo | Ejemplo |
|---|---|---|
| Variable / función | `snake_case` | `analizar_imagen`, `resultado_ia` |
| Constante | `UPPER_SNAKE_CASE` | `MAX_TOKENS` |
| Clase | `PascalCase` | `DocumentoClinico`, `ResultadoIa` |
| Módulo / archivo | `snake_case` | `openai_ia.py`, `storage.py` |

### 5.2 Type hints **[OBLIGATORIO]**

```python
# ✅ Siempre anotar parámetros y retornos
async def analizar_imagen(
    file: UploadFile,
    paciente_id: str,
    db: Session,
) -> ImagenAnalisisResponse:
    ...

# ❌ Prohibido
def analizar_imagen(file, paciente_id, db):
    ...
```

- Usar `from __future__ import annotations` en módulos con tipos circulares.
- Usar `Optional[X]` o `X | None` (Python 3.10+) explícitamente.

### 5.3 Pydantic y schemas

```python
class RecetaInput(BaseModel):
    paciente_id: UUID
    medicamentos: list[MedicamentoItem]
    diagnostico: str

    class Config:
        str_strip_whitespace = True
```

- Todos los endpoints deben tener un `response_model` explícito.
- Usar `Field(...)` con descripción en todos los atributos del schema.

### 5.4 Linting

```ini
# .flake8
[flake8]
max-line-length = 120
extend-ignore = E203, W503
```

Ejecutar `black`, `isort` y `flake8` antes de cada commit.

---

## 6. Solidity (Smart Contract)

### 6.1 Nomenclatura

| Elemento | Estilo | Ejemplo |
|---|---|---|
| Contrato | `PascalCase` | `RegistroRecetas` |
| Función pública | `camelCase` | `registrarReceta()` |
| Variable de estado | `camelCase` | `totalRecetas` |
| Evento | `PascalCase` | `RecetaRegistrada` |
| Constante | `UPPER_SNAKE_CASE` | `MAX_RECETAS` |

### 6.2 Seguridad **[OBLIGATORIO]**

```solidity
// ✅ Siempre verificar el caller
modifier soloAutorizado() {
    require(msg.sender == autorizado, "No autorizado");
    _;
}

// ✅ Verificar inputs
function registrarReceta(bytes32 hash, uint256 pacienteId) external soloAutorizado {
    require(hash != bytes32(0), "Hash invalido");
    require(pacienteId > 0, "ID invalido");
}
```

- Prohibido usar `tx.origin` para autenticación. Usar `msg.sender`.
- Todos los cambios de estado deben emitir un evento.
- Usar `uint256` en vez de alias más cortos (`uint`).

---

## 7. Estilos CSS / Angular

### 7.1 Nomenclatura BEM

```scss
// ✅ Bloque__Elemento--Modificador
.cita-card { }
.cita-card__titulo { }
.cita-card__titulo--destacado { }
```

### 7.2 Reglas Angular

- Un componente por archivo. Máximo 300 líneas por componente.
- Usar `OnPush` change detection en todos los componentes que no dependan de observables globales.
- Suscripciones: siempre con `AsyncPipe` o desuscribir en `ngOnDestroy` con `takeUntilDestroyed()`.
- Prohibido acceder al DOM directamente. Usar `@ViewChild` con `ElementRef` o Renderer2.

---

## 8. GraphQL (schemas y resolvers)

```graphql
# ✅ Nombres en PascalCase para tipos; camelCase para campos y queries
type Cita {
  id: ID!
  pacienteId: String!
  fechaHora: String!
  estado: EstadoCita!
}

type Query {
  misCitas: [Cita!]!
  citaById(id: ID!): Cita
}

type Mutation {
  crearCita(input: CitaInput!): Cita!
  cancelarCita(id: ID!): Cita!
}
```

- Todos los campos que no pueden ser nulos deben marcarse con `!`.
- Usar `input` types separados para mutations. Nunca pasar el tipo completo como parámetro.
- Los errores de dominio se retornan como `GraphQLError` con `extensions.code`.

---

## 9. Base de datos y Prisma ORM

### 9.1 Migraciones **[OBLIGATORIO]**

```bash
# ✅ Siempre usar migraciones nombradas descriptivamente
npx prisma migrate dev --name agregar_campo_blockchain_tx_a_receta

# ❌ Prohibido modificar el schema en producción sin migración
npx prisma db push   # solo en desarrollo local
```

### 9.2 Nomenclatura en schema.prisma

```prisma
model Cita {
  id          String    @id @default(uuid())
  pacienteId  String    @map("paciente_id")   // camelCase en Prisma, snake_case en BD
  fechaHora   DateTime  @map("fecha_hora")
  estado      EstadoCita @default(AGENDADA)

  @@map("citas")  // nombre de tabla en snake_case
}
```

- Modelos en `PascalCase`, campos en `camelCase`, tablas en `snake_case`.
- Siempre incluir `createdAt` / `updatedAt` con `@default(now())` / `@updatedAt`.

---

## 10. Git y control de versiones

### 10.1 Ramas

| Rama | Propósito |
|---|---|
| `main` | Producción. Solo merge desde `develop` vía PR aprobado. |
| `develop` | Integración continua. Base para features. |
| `feature/<ticket>-descripcion` | Nueva funcionalidad. Ej: `feature/CU12-agendar-cita` |
| `fix/<ticket>-descripcion` | Corrección de bug. Ej: `fix/CU09-fifo-stock-negativo` |
| `hotfix/<descripcion>` | Corrección urgente en producción. |

### 10.2 Commits (Conventional Commits) **[OBLIGATORIO]**

```
<tipo>(<scope>): <descripción en imperativo, español, máx 72 chars>

[cuerpo opcional]

[pie: BREAKING CHANGE o refs]
```

| Tipo | Cuándo |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `refactor` | Cambio que no agrega ni corrige |
| `test` | Añadir o corregir pruebas |
| `docs` | Solo documentación |
| `chore` | Tareas de build, CI, dependencias |
| `perf` | Mejora de rendimiento |

```bash
# ✅ Ejemplos correctos
feat(receta): agregar registro inmutable en Polygon Amoy al emitir receta controlada
fix(inventario): corregir descuento FIFO cuando el último lote cubre exactamente el restante
test(cita): agregar pruebas de caja blanca para crearCita (caminos C1-C5)

# ❌ Prohibidos
git commit -m "fix"
git commit -m "cambios varios"
git commit -m "WIP"
```

### 10.3 Pull Requests

- Mínimo **1 aprobación** de otro miembro del equipo.
- El PR debe pasar todos los checks de CI (lint, tests, build Docker).
- Descripción obligatoria: qué cambia, por qué, cómo probarlo.
- Máximo 400 líneas cambiadas por PR (excluir archivos generados).

---

## 11. Pruebas

### 11.1 Cobertura mínima **[OBLIGATORIO]**

| Microservicio | Cobertura mínima |
|---|---|
| `ms-ms-pacientes-nextjs` | 70 % de líneas |
| `ms-springboot-gestion` | 75 % de líneas |
| `ms-blockchain` | 60 % de líneas |
| `ms-diagnostico-ia` | 65 % de líneas |

### 11.2 Nomenclatura de pruebas

```typescript
// ✅ describe + it en formato "debe <comportamiento esperado>"
describe('RecetaService.emitir', () => {
  it('debe persistir la receta aunque falle el registro en blockchain', async () => { });
  it('debe registrar en blockchain si el medicamento es controlado', async () => { });
});
```

```python
# ✅ Python: prefijo test_ + descripción snake_case
def test_analizar_imagen_retorna_resultado_con_anomalia_detectada():
    ...
```

### 11.3 Regla AAA (Arrange-Act-Assert)

```typescript
it('debe lanzar FORBIDDEN si el paciente intenta ver citas de otro', async () => {
  // Arrange
  const ctx = buildContext({ rol: 'PACIENTE', supabaseUid: 'uid-A' });

  // Act & Assert
  await expect(
    crearCita(null, { pacienteId: 'id-de-otro' }, ctx)
  ).rejects.toThrow('FORBIDDEN');
});
```

---

## 12. Seguridad

### 12.1 Reglas obligatorias **[OBLIGATORIO]**

- **Prohibido hardcodear secrets** en código fuente. Usar variables de entorno (`.env`, Kubernetes Secrets).
- **Prohibido loguear** tokens JWT, contraseñas, hashes de blockchain o datos de salud del paciente.
- Todos los endpoints de GraphQL y REST deben validar el JWT de Supabase antes de ejecutar lógica.
- Validar y sanitizar todos los inputs del usuario antes de pasarlos a la BD o a la IA.
- Las queries de Prisma deben usar parámetros (`where: { id }`) nunca interpolación de strings.

### 12.2 Variables de entorno

```bash
# ✅ Siempre en .env.example con valor placeholder
DATABASE_URL="postgresql://user:password@localhost:5432/clinica"
SUPABASE_JWT_SECRET="<secret>"
BLOCKCHAIN_PRIVATE_KEY="<private-key>"
OPENAI_API_KEY="<api-key>"

# .env (nunca en git — está en .gitignore)
```

---

## 13. Documentación en código

### 13.1 JSDoc / TSDoc

```typescript
/**
 * Crea una cita médica y la persiste con estado AGENDADA.
 * Si no se especifica `medicoUid`, asigna automáticamente el médico
 * con menos citas AGENDADAS en el momento de la solicitud.
 *
 * @param _parent - Parámetro de GraphQL (no usado)
 * @param args - Datos de entrada de la cita
 * @param ctx - Contexto con Prisma y usuario autenticado
 * @returns La cita creada con su ID y estado
 * @throws {GraphQLError} FORBIDDEN si el paciente intenta crear cita de otro
 * @throws {GraphQLError} BAD_USER_INPUT si la fecha no es futura
 */
async function crearCita(_parent, args, ctx): Promise<Cita> { }
```

### 13.2 JavaDoc

```java
/**
 * Descuenta stock aplicando política FIFO ordenada por fecha de vencimiento.
 *
 * @param medicamentoId UUID del medicamento a descontar
 * @param cantidad      Cantidad a descontar (debe ser > 0)
 * @param motivo        Descripción del motivo del movimiento
 * @return Lista de lotes consumidos con la cantidad tomada de cada uno
 * @throws BusinessException si la cantidad es ≤ 0 o el stock es insuficiente
 */
public List<ConsumoLote> descontarFIFO(UUID medicamentoId, int cantidad, String motivo) { }
```

### 13.3 Docstrings Python (Google style)

```python
async def analizar_imagen(file: UploadFile, paciente_id: str, db: Session) -> ImagenAnalisisResponse:
    """Analiza una imagen clínica con GPT-4o-mini y guarda el resultado.

    Args:
        file: Imagen clínica en formato JPEG o PNG.
        paciente_id: UUID del paciente propietario del documento.
        db: Sesión de base de datos SQLAlchemy.

    Returns:
        ImagenAnalisisResponse con el análisis generado por IA y el ID del resultado.

    Raises:
        HTTPException: 400 si el formato de imagen no es soportado.
        HTTPException: 503 si la API de OpenAI no está disponible.
    """
```

---

## Historial de versiones

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0.0 | 2026-07-31 | Versión inicial — cubre los 4 microservicios, Angular, React Native y Solidity |

---

*Este documento es un estándar vivo. Las propuestas de cambio se gestionan mediante PR al archivo
`CODING_STANDARDS.md` con el tipo de commit `docs(standards):`.*
