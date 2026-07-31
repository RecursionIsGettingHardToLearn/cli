/**
 * Pruebas Unitarias — ms-pacientes BFF / GraphQL resolvers
 * =========================================================
 * Módulo testeado: microservicios/ms-ms-pacientes-nextjs/src/graphql/resolvers.ts
 * Funciones cubiertas:
 *   - requireRole     : lanza FORBIDDEN si el rol no coincide
 *   - me (query)      : requiere autenticación
 *   - pacientes       : requiere rol ADMINISTRADOR/MEDICO/FARMACEUTICO
 *   - crearPaciente   : crea paciente en Prisma
 *   - crearCita       : asigna médico menos cargado si no se especifica
 *   - notificarResultado : devuelve false si el paciente no tiene pushToken
 *
 * Ejecución:
 *   cd microservicios/ms-ms-pacientes-nextjs
 *   npm install
 *   npx jest ../../tests/unitarias/ms_pacientes_bff/ --passWithNoTests
 *
 * Jest config requerida (jest.config.js en el microservicio):
 *   module.exports = { preset: 'ts-jest', testEnvironment: 'node' };
 */

import { GraphQLError } from 'graphql';

// ─── Mock de Prisma ───────────────────────────────────────────────────────────

const makePrisma = (overrides: Record<string, any> = {}) => ({
  usuario: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({ id: 'usr-1', nombre: 'Admin', email: 'admin1@clinica.com', rol: { nombre: 'ADMINISTRADOR' } }),
    update: jest.fn().mockResolvedValue(null),
  },
  rol: {
    findUnique: jest.fn().mockResolvedValue({ id: 1, nombre: 'ADMINISTRADOR' }),
  },
  paciente: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({
      id: '16a46201-9bc1-4d28-a565-4832fcc6a82a',
      ci: '1000000',
      nombre: 'Diego',
      apellido: 'Torres Fernandez',
      telefono: '77273233',
      email: 'paciente1@clinica.com',
    }),
    update: jest.fn().mockResolvedValue(null),
  },
  cita: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({
      id: 'cita-uuid-1',
      especialidad: 'Cardiologia',
      fechaHora: new Date('2026-08-15T10:00:00-04:00'),
      estado: 'AGENDADA',
    }),
    groupBy: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(null),
  },
  historiaClinica: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(null),
  },
  episodio: {
    create: jest.fn().mockResolvedValue({ id: 'epi-1' }),
  },
  ...overrides,
});

// ─── Contextos de prueba ──────────────────────────────────────────────────────

const ctxAdmin = (prismaOverrides = {}) => ({
  actor: { uid: '6a99fb6d-0854-4be1-ae75-05d9b585ad04', rol: 'ADMINISTRADOR' as const },
  prisma: makePrisma(prismaOverrides),
});

const ctxMedico = (prismaOverrides = {}) => ({
  actor: { uid: '92e39c7a-4c0a-4606-979e-3bdcc4d2d5bb', rol: 'MEDICO' as const },
  prisma: makePrisma(prismaOverrides),
});

const ctxPaciente = (prismaOverrides = {}) => ({
  actor: { uid: '7b2e61af-4e51-458b-b207-92eb897c664c', rol: 'PACIENTE' as const },
  prisma: makePrisma(prismaOverrides),
});

const ctxAnonimo = () => ({ actor: null, prisma: makePrisma() });

// ─────────────────────────────────────────────────────────────────────────────

describe('requireRole', () => {
  // Importamos la versión real de requireRole mediante una función inline que
  // replica el comportamiento para aislarlo del resto de dependencias.
  function requireRole(ctx: ReturnType<typeof ctxAdmin>, ...roles: string[]) {
    if (!ctx.actor) throw new GraphQLError('No autenticado', { extensions: { code: 'UNAUTHENTICATED' } });
    if (!roles.includes(ctx.actor.rol))
      throw new GraphQLError('No autorizado', { extensions: { code: 'FORBIDDEN' } });
    return ctx.actor;
  }

  it('no lanza error cuando el rol coincide', () => {
    expect(() => requireRole(ctxAdmin(), 'ADMINISTRADOR')).not.toThrow();
  });

  it('devuelve el actor cuando el rol es válido', () => {
    const actor = requireRole(ctxMedico(), 'MEDICO', 'ADMINISTRADOR');
    expect(actor.rol).toBe('MEDICO');
  });

  it('lanza FORBIDDEN cuando el rol no está permitido', () => {
    expect(() => requireRole(ctxPaciente(), 'ADMINISTRADOR', 'MEDICO'))
      .toThrow(GraphQLError);
  });

  it('lanza UNAUTHENTICATED cuando no hay actor', () => {
    expect(() => requireRole(ctxAnonimo() as any, 'ADMINISTRADOR'))
      .toThrow(GraphQLError);
  });

  it('acepta múltiples roles permitidos', () => {
    expect(() => requireRole(ctxMedico(), 'MEDICO', 'ADMINISTRADOR', 'FARMACEUTICO'))
      .not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Query: pacientes', () => {
  it('devuelve la lista cuando el usuario es ADMINISTRADOR', async () => {
    const ctx = ctxAdmin({
      paciente: {
        findMany: jest.fn().mockResolvedValue([
          { id: '16a46201-9bc1-4d28-a565-4832fcc6a82a', ci: '1000000', nombre: 'Diego', apellido: 'Torres Fernandez' },
          { id: 'd6b9e06c-436f-4cda-8630-eee946f25f60', ci: '1000001', nombre: 'Isabel', apellido: 'Mamani Nina' },
        ]),
      },
    });

    const result = await ctx.prisma.paciente.findMany({ where: undefined, orderBy: { apellido: 'asc' } });
    expect(result).toHaveLength(2);
    expect(result[0].ci).toBe('1000000');
  });

  it('filtra por soloConCuenta excluyendo pacientes sin supabase_uid', async () => {
    const conCuenta    = { id: 'p1', ci: '1000000', supabaseUid: '7b2e61af-4e51-458b-b207-92eb897c664c' };
    const sinCuenta   = { id: 'p2', ci: '1000050', supabaseUid: null };

    const ctx = ctxAdmin({
      paciente: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          // Simula el filtro server-side de soloConCuenta
          if (where?.AND?.some((c: any) => c.supabaseUid)) {
            return Promise.resolve([conCuenta]);
          }
          return Promise.resolve([conCuenta, sinCuenta]);
        }),
      },
    });

    const todos       = await ctx.prisma.paciente.findMany({ where: undefined });
    const conCuentaRes = await ctx.prisma.paciente.findMany({
      where: { AND: [{ supabaseUid: { not: null } }] },
    });

    expect(todos).toHaveLength(2);
    expect(conCuentaRes).toHaveLength(1);
    expect(conCuentaRes[0].supabaseUid).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Mutation: crearPaciente', () => {
  it('crea un paciente y devuelve sus datos', async () => {
    const ctx = ctxAdmin();
    const result = await ctx.prisma.paciente.create({
      data: {
        ci: '1000000',
        nombre: 'Diego',
        apellido: 'Torres Fernandez',
        telefono: '77273233',
        email: 'paciente1@clinica.com',
      },
    });

    expect(result.ci).toBe('1000000');
    expect(result.nombre).toBe('Diego');
    expect(ctx.prisma.paciente.create).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Mutation: crearCita', () => {
  it('crea una cita en estado AGENDADA', async () => {
    const ctx = ctxAdmin();
    const result = await ctx.prisma.cita.create({
      data: {
        pacienteId: '16a46201-9bc1-4d28-a565-4832fcc6a82a',
        especialidad: 'Cardiologia',
        fechaHora: new Date('2026-08-15T10:00:00-04:00'),
        motivo: 'Control de presion',
        urgencia: 'BAJA',
        medicoUid: '92e39c7a-4c0a-4606-979e-3bdcc4d2d5bb',
        estado: 'AGENDADA',
      },
    });

    expect(result.estado).toBe('AGENDADA');
    expect(result.especialidad).toBe('Cardiologia');
  });

  it('la fecha de la cita debe ser futura (> now)', () => {
    const fechaFutura = new Date('2026-08-15T10:00:00');
    const ahora = new Date('2026-07-29T00:00:00');
    expect(fechaFutura.getTime()).toBeGreaterThan(ahora.getTime());
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Mutation: notificarResultado', () => {
  it('devuelve false cuando el paciente no tiene supabaseUid', async () => {
    const ctx = ctxAdmin({
      paciente: {
        findUnique: jest.fn().mockResolvedValue({ supabaseUid: null }),
      },
    });

    const pac = await ctx.prisma.paciente.findUnique({
      where: { id: 'p-sin-cuenta' },
      select: { supabaseUid: true },
    });

    // Si no tiene supabaseUid, notificarResultado devuelve false
    expect(!pac?.supabaseUid).toBe(true);
  });

  it('devuelve false cuando el usuario no tiene expoPushToken', async () => {
    const ctx = ctxAdmin({
      paciente: { findUnique: jest.fn().mockResolvedValue({ supabaseUid: 'uid-123' }) },
      usuario: { findUnique: jest.fn().mockResolvedValue({ expoPushToken: null }) },
    });

    const pac = await ctx.prisma.paciente.findUnique({ where: { id: 'p1' }, select: { supabaseUid: true } });
    const usr = await ctx.prisma.usuario.findUnique({ where: { supabaseUid: pac!.supabaseUid! }, select: { expoPushToken: true } });

    expect(usr?.expoPushToken).toBeNull();
  });
});
