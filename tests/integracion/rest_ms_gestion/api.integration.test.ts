/**
 * Pruebas de Integración — ms-gestion / REST API (Spring Boot)
 * =============================================================
 * Qué se prueba: los endpoints REST reales de ms-gestion con el servicio
 * levantado localmente (Java + Postgres). Se verifica que los controladores,
 * servicios y repositorios funcionen de extremo a extremo.
 *
 * Endpoints cubiertos:
 *   GET  /actuator/health
 *   GET  /api/medicamentos
 *   GET  /api/medicamentos/{id}
 *   POST /api/medicamentos
 *   GET  /api/categorias
 *   GET  /api/proveedores
 *   GET  /api/inventario/alertas
 *   GET  /api/facturas
 *
 * Pre-requisitos:
 *   1. ms-gestion corriendo en http://localhost:8080
 *      (docker compose up ms-gestion)
 *   2. JWT de admin válido en la variable de entorno MS_GESTION_TOKEN
 *
 * Ejecución:
 *   MS_GESTION_URL=http://localhost:8080 \
 *   MS_GESTION_TOKEN=<jwt_admin> \
 *   npx jest tests/integracion/rest_ms_gestion/ --testTimeout=15000 --runInBand
 */

const BASE    = process.env.MS_GESTION_URL   ?? 'http://localhost:8080';
const TOKEN   = process.env.MS_GESTION_TOKEN ?? 'CONFIGURAR_MS_GESTION_TOKEN';

// ─── Helper ──────────────────────────────────────────────────────────────────

async function api(path: string, opts: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...(opts.headers ?? {}),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] ms-gestion — Health check', () => {
  it('el servicio responde 200 en /actuator/health', async () => {
    const res = await fetch(`${BASE}/actuator/health`);
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.status).toBe('UP');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] ms-gestion — GET /api/medicamentos', () => {
  it('devuelve lista de medicamentos no vacía', async () => {
    const res  = await api('/api/medicamentos');
    const body = await res.json() as any[];

    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('cada medicamento tiene los campos obligatorios', async () => {
    const res  = await api('/api/medicamentos');
    const body = await res.json() as any[];

    for (const med of body.slice(0, 5)) {
      expect(med).toHaveProperty('id');
      expect(med).toHaveProperty('nombre');
      expect(med).toHaveProperty('precioVenta');
      expect(med).toHaveProperty('activo');
    }
  });

  it('filtra por nombre (q=paracetamol) y devuelve resultados', async () => {
    const res  = await api('/api/medicamentos?q=paracetamol');
    const body = await res.json() as any[];

    expect(res.status).toBe(200);
    expect(body.some((m: any) => m.nombre.toLowerCase().includes('paracetamol'))).toBe(true);
  });

  it('filtra activo=true y todos los resultados están activos', async () => {
    const res  = await api('/api/medicamentos?activo=true');
    const body = await res.json() as any[];

    expect(res.status).toBe(200);
    expect(body.every((m: any) => m.activo === true)).toBe(true);
  });

  it('sin token devuelve 401 o 403', async () => {
    const res = await fetch(`${BASE}/api/medicamentos`);
    expect([401, 403]).toContain(res.status);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] ms-gestion — POST /api/medicamentos', () => {
  it('crea un medicamento y devuelve 200 con id asignado', async () => {
    const payload = {
      nombre:        'Test Vitamina D3 1000UI',
      descripcion:   'Suplemento de prueba de integracion',
      categoriaId:   10,  // Vitaminas (seed: categoria id 10)
      precioVenta:   8.50,
      requiereReceta: false,
      controlado:    false,
      stockMinimo:   5,
    };

    const res  = await api('/api/medicamentos', { method: 'POST', body: JSON.stringify(payload) });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.id).toBeTruthy();
    expect(body.nombre).toBe(payload.nombre);
    expect(body.activo).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] ms-gestion — GET /api/categorias', () => {
  it('devuelve 10 categorías (las del seed)', async () => {
    const res  = await api('/api/categorias');
    const body = await res.json() as any[];

    expect(res.status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(10);
  });

  it('la categoría "Analgesicos" existe', async () => {
    const res  = await api('/api/categorias');
    const body = await res.json() as any[];

    expect(body.some((c: any) => c.nombre === 'Analgesicos')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] ms-gestion — GET /api/proveedores', () => {
  it('devuelve al menos 6 proveedores (los del seed)', async () => {
    const res  = await api('/api/proveedores');
    const body = await res.json() as any[];

    expect(res.status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(6);
  });

  it('el proveedor "FarmaSur SRL" existe', async () => {
    const res  = await api('/api/proveedores');
    const body = await res.json() as any[];

    expect(body.some((p: any) => p.nombre === 'FarmaSur SRL')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] ms-gestion — GET /api/inventario/alertas', () => {
  it('devuelve estructura de alertas sin errores 5xx', async () => {
    const res = await api('/api/inventario/alertas');
    expect(res.status).toBeLessThan(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] ms-gestion — GET /api/facturas', () => {
  it('devuelve al menos 300 facturas (las del seed)', async () => {
    const res  = await api('/api/facturas');
    const body = await res.json() as any[];

    expect(res.status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(300);
  });

  it('las facturas tienen el formato de número correcto (F-YYYY-NNNNNN)', async () => {
    const res  = await api('/api/facturas');
    const body = await res.json() as any[];

    const muestra = body.slice(0, 10);
    for (const f of muestra) {
      expect(f.numero).toMatch(/^F-\d{4}-\d{6}$/);
    }
  });

  it('el correlativo de la primera factura comienza desde F-2026-000001', async () => {
    const res  = await api('/api/facturas');
    const body = await res.json() as any[];

    const numeros = body.map((f: any) => f.numero).sort();
    expect(numeros[0]).toBe('F-2026-000001');
  });
});
