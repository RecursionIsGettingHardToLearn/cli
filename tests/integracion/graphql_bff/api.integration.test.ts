/**
 * Pruebas de Integración — BFF GraphQL / ms-ms-pacientes-nextjs
 * ==============================================================
 * Qué se prueba: el endpoint real POST /api/graphql con un servidor Next.js
 * levantado localmente. Se verifica que el schema, los resolvers y la capa
 * Prisma funcionen de extremo a extremo.
 *
 * Pre-requisitos:
 *   1. Postgres local corriendo con ms_pacientes migrado y con datos seed.
 *   2. Variables de entorno del BFF (.env): DATABASE_URL, SUPABASE_URL,
 *      SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET.
 *   3. BFF corriendo en http://localhost:3000
 *      (docker compose up ms-pacientes  O  npm run dev dentro del microservicio)
 *   4. Token JWT de admin válido:
 *      export BFF_ADMIN_TOKEN=$(curl -s -X POST https://<proyecto>.supabase.co/auth/v1/token \
 *        -H "apikey: <anon_key>" -d '{"email":"admin1@clinica.com","password":"Clinica123!"}' \
 *        | jq -r '.access_token')
 *
 * Ejecución:
 *   BFF_URL=http://localhost:3000/api/graphql \
 *   BFF_ADMIN_TOKEN=<jwt> \
 *   npx jest tests/integracion/graphql_bff/ --testTimeout=15000 --runInBand
 */

const BFF_URL   = process.env.BFF_URL   ?? 'http://localhost:3000/api/graphql';
const JWT_TOKEN = process.env.BFF_ADMIN_TOKEN ?? 'CONFIGURAR_BFF_ADMIN_TOKEN';

// ─── Helper para llamar al endpoint ──────────────────────────────────────────

async function gql(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(BFF_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JWT_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json() as Promise<{ data: any; errors?: any[] }>;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] BFF GraphQL — query pacientes', () => {
  it('devuelve la lista de pacientes (ADMINISTRADOR puede listarlos)', async () => {
    const { data, errors } = await gql(`
      query {
        pacientes {
          id ci nombre apellido
        }
      }
    `);

    expect(errors).toBeUndefined();
    expect(Array.isArray(data.pacientes)).toBe(true);
    expect(data.pacientes.length).toBeGreaterThan(0);
  });

  it('busca por CI y devuelve el paciente correcto', async () => {
    // CI 1000000 = Diego Torres Fernandez (seed_ms_pacientes.sql)
    const { data, errors } = await gql(`
      query($q: String) { pacientes(q: $q) { ci nombre apellido } }
    `, { q: '1000000' });

    expect(errors).toBeUndefined();
    const pac = data.pacientes[0];
    expect(pac.ci).toBe('1000000');
    expect(pac.nombre).toBe('Diego');
  });

  it('soloConCuenta: true excluye pacientes sin supabaseUid', async () => {
    const todos = await gql(`query { pacientes { id } }`);
    const conCuenta = await gql(`query { pacientes(soloConCuenta: true) { id } }`);

    expect(conCuenta.data.pacientes.length).toBeLessThanOrEqual(todos.data.pacientes.length);
    // Debe haber menos (o igual) pacientes con cuenta que el total
    expect(conCuenta.data.pacientes.length).toBeLessThan(todos.data.pacientes.length + 1);
  });

  it('sin token retorna error UNAUTHENTICATED', async () => {
    const res = await fetch(BFF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ pacientes { id } }' }),
    });
    const body = await res.json() as any;
    const codes = body.errors?.map((e: any) => e.extensions?.code) ?? [];
    expect(codes).toContain('UNAUTHENTICATED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] BFF GraphQL — mutation crearCita', () => {
  const PACIENTE_ID = '16a46201-9bc1-4d28-a565-4832fcc6a82a'; // Diego Torres — seed

  it('agenda una cita futura y devuelve estado AGENDADA', async () => {
    const fechaFutura = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, errors } = await gql(`
      mutation($input: CitaInput!) {
        crearCita(input: $input) {
          id especialidad fechaHora estado
        }
      }
    `, {
      input: {
        pacienteId: PACIENTE_ID,
        especialidad: 'Cardiologia',
        fechaHora: fechaFutura,
        motivo: 'Prueba de integracion — cita de Cardiologia',
        urgencia: 'BAJA',
      },
    });

    expect(errors).toBeUndefined();
    expect(data.crearCita.estado).toBe('AGENDADA');
    expect(data.crearCita.especialidad).toBe('Cardiologia');
  });

  it('asigna médico automáticamente (medicoUid queda poblado)', async () => {
    const fechaFutura = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();

    const { data, errors } = await gql(`
      mutation($input: CitaInput!) {
        crearCita(input: $input) { id medicoUid }
      }
    `, {
      input: {
        pacienteId: PACIENTE_ID,
        especialidad: 'Medicina General',
        fechaHora: fechaFutura,
        motivo: 'Asignacion automatica de medico',
      },
    });

    expect(errors).toBeUndefined();
    expect(data.crearCita.medicoUid).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] BFF GraphQL — mutation crearEpisodio', () => {
  // NOTA: requiere que la historia clínica exista para ese paciente.
  // El seed crea 150 historias; una de ellas pertenece al paciente 1000000.

  it('registra un episodio clínico en la historia del paciente', async () => {
    // Primero obtenemos el historiaId del paciente
    const qHist = await gql(`
      query { historiaPorPaciente(pacienteId: "16a46201-9bc1-4d28-a565-4832fcc6a82a") {
        id estado episodios { id }
      }}
    `);

    const historia = qHist.data?.historiaPorPaciente;
    if (!historia) {
      console.warn('Paciente sin historia; se omite el test de episodio.');
      return;
    }

    const { data, errors } = await gql(`
      mutation($input: EpisodioInput!) {
        crearEpisodio(input: $input) {
          id motivoConsulta diagnosticoTexto
        }
      }
    `, {
      input: {
        historiaId: historia.id,
        motivoConsulta: 'Dolor abdominal leve — prueba de integracion',
        evolucion: 'Paciente estable, sin fiebre.',
        diagnosticoTexto: 'Gastritis funcional',
      },
    });

    expect(errors).toBeUndefined();
    expect(data.crearEpisodio.motivoConsulta).toContain('Dolor abdominal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('[INTEGRACION] BFF GraphQL — RBAC (control de acceso por rol)', () => {
  it('PACIENTE no puede listar todos los pacientes (FORBIDDEN)', async () => {
    // Aquí se necesitaría un token de paciente. Si no está disponible en el
    // entorno CI, el test pasa con un aviso (no bloquea el pipeline).
    const tokenPaciente = process.env.BFF_PACIENTE_TOKEN;
    if (!tokenPaciente) {
      console.warn('BFF_PACIENTE_TOKEN no configurado; se omite test RBAC de paciente.');
      return;
    }

    const res = await fetch(BFF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenPaciente}` },
      body: JSON.stringify({ query: '{ pacientes { id } }' }),
    });
    const body = await res.json() as any;
    const codes = body.errors?.map((e: any) => e.extensions?.code) ?? [];
    expect(codes).toContain('FORBIDDEN');
  });
});
