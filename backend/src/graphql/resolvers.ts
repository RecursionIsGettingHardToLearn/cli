import { GraphQLScalarType, Kind, GraphQLError } from 'graphql';
import type { PrismaClient } from '@prisma/client';
import type { Actor, Rol } from '@/lib/auth';
import { sendExpoPush, EXPO_TOKEN_RE } from '@/lib/push';

type Ctx = { actor: Actor | null; prisma: PrismaClient };

// America/La_Paz es UTC-4 fijo (Bolivia no aplica horario de verano).
const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Fecha-hora legible en zona La Paz, ej: "vie, 6 jun, 10:00". */
function fechaLegibleLaPaz(d: Date): string {
  try {
    return new Intl.DateTimeFormat('es-BO', {
      timeZone: 'America/La_Paz',
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d).replace(/\./g, '');
  } catch {
    return d.toISOString();
  }
}

/** Solo la hora "HH:mm" en zona La Paz. */
function horaLaPaz(d: Date): string {
  try {
    return new Intl.DateTimeFormat('es-BO', {
      timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Rango [inicio, fin) que cubre TODO el día de "mañana" en hora de La Paz,
 * expresado en instantes UTC reales (para comparar contra cita.fechaHora, que
 * Prisma guarda en UTC). No usa la TZ del servidor.
 */
function rangoMananaLaPaz(now: Date): { inicio: Date; fin: Date } {
  // "Reloj de pared" de La Paz = ahora - 4h; de ahí extraemos su fecha.
  const laPazNow = new Date(now.getTime() - LA_PAZ_OFFSET_MS);
  const y = laPazNow.getUTCFullYear();
  const m = laPazNow.getUTCMonth();
  const d = laPazNow.getUTCDate();
  // Mañana 00:00 La Paz -> instante UTC = (medianoche local) + 4h.
  const inicio = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0) + LA_PAZ_OFFSET_MS);
  const fin = new Date(Date.UTC(y, m, d + 2, 0, 0, 0, 0) + LA_PAZ_OFFSET_MS);
  return { inicio, fin };
}

/**
 * Push #1 — Cita confirmada. Fire-and-forget: NUNCA bloquea ni rompe crearCita.
 * Busca el usuario dueño del paciente (vía supabaseUid) y le envía el aviso.
 */
async function notificarCitaConfirmada(
  ctx: Ctx,
  cita: { id: string; pacienteId: string; fechaHora: Date; especialidad: string | null },
): Promise<void> {
  const pac = await ctx.prisma.paciente.findUnique({
    where: { id: cita.pacienteId },
    select: { supabaseUid: true },
  });
  if (!pac?.supabaseUid) return;
  const u = await ctx.prisma.usuario.findUnique({
    where: { supabaseUid: pac.supabaseUid },
    select: { expoPushToken: true },
  });
  await sendExpoPush(
    u?.expoPushToken,
    'Cita confirmada 🏥',
    `✅ Tu cita quedó agendada: ${fechaLegibleLaPaz(cita.fechaHora)} — ${cita.especialidad ?? 'general'}`,
    { citaId: cita.id, tipo: 'cita_confirmada' },
  );
}

function requireAuth(ctx: Ctx): Actor {
  if (!ctx.actor) throw new GraphQLError('No autenticado', { extensions: { code: 'UNAUTHENTICATED' } });
  return ctx.actor;
}

function requireRole(ctx: Ctx, ...roles: Rol[]): Actor {
  const a = requireAuth(ctx);
  if (!roles.includes(a.rol)) throw new GraphQLError('No autorizado', { extensions: { code: 'FORBIDDEN' } });
  return a;
}

/**
 * Ficha de paciente del actor autenticado. Si aun no esta vinculada por
 * supabaseUid, intenta AUTO-VINCULAR por email: busca una ficha creada en
 * recepcion con el mismo correo y sin uid, y le escribe el uid del JWT.
 * Asi el paciente queda habilitado para auto-agendarse sin tocar la BD.
 */
async function pacienteDelActor(ctx: Ctx, a: Actor) {
  const porUid = await ctx.prisma.paciente.findUnique({ where: { supabaseUid: a.uid } });
  if (porUid) return porUid;
  if (!a.email) return null;
  const porEmail = await ctx.prisma.paciente.findFirst({
    where: { supabaseUid: null, email: { equals: a.email, mode: 'insensitive' } },
  });
  if (!porEmail) return null;
  return ctx.prisma.paciente.update({
    where: { id: porEmail.id },
    data: { supabaseUid: a.uid },
  });
}

/**
 * Asignacion automatica de medico: devuelve el supabaseUid del usuario con rol
 * MEDICO que tenga MENOS citas AGENDADAS (reparto equitativo de carga).
 * Si todavia no existe ningun medico en la tabla usuario, devuelve '' y la
 * cita queda en el pool comun (comportamiento anterior, sin romper nada).
 */
async function medicoMenosCargado(ctx: Ctx): Promise<string> {
  const medicos = await ctx.prisma.usuario.findMany({
    where: { rol: { nombre: 'MEDICO' } },
    select: { supabaseUid: true },
  });
  if (medicos.length === 0) return '';
  const carga = await ctx.prisma.cita.groupBy({
    by: ['medicoUid'],
    where: { estado: 'AGENDADA', medicoUid: { in: medicos.map((m) => m.supabaseUid) } },
    _count: { _all: true },
  });
  const porUid = new Map(carga.map((c) => [c.medicoUid, c._count._all]));
  let elegido = medicos[0].supabaseUid;
  let min = porUid.get(elegido) ?? 0;
  for (const m of medicos) {
    const n = porUid.get(m.supabaseUid) ?? 0;
    if (n < min) { min = n; elegido = m.supabaseUid; }
  }
  return elegido;
}

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  description: 'Fecha-hora ISO-8601',
  serialize(v) { return v instanceof Date ? v.toISOString() : v; },
  parseValue(v) { return new Date(v as string); },
  parseLiteral(ast) { return ast.kind === Kind.STRING ? new Date(ast.value) : null; },
});

export const resolvers = {
  DateTime,

  Query: {
    async me(_p: unknown, _a: unknown, ctx: Ctx) {
      const a = requireAuth(ctx);
      // Lazy-provision del directorio local de personal a partir del JWT.
      const rol = await ctx.prisma.rol.findUnique({ where: { nombre: a.rol } });
      return ctx.prisma.usuario.upsert({
        where: { supabaseUid: a.uid },
        update: {},
        create: {
          supabaseUid: a.uid,
          nombre: a.nombre ?? a.email ?? a.uid,
          email: a.email ?? `${a.uid}@sin-email.local`,
          rolId: rol?.id ?? 4,
        },
      });
    },

    miPaciente(_p: unknown, _a: unknown, ctx: Ctx) {
      const a = requireAuth(ctx);
      return pacienteDelActor(ctx, a);
    },

    usuarios(_p: unknown, _a: unknown, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR');
      return ctx.prisma.usuario.findMany({ orderBy: { nombre: 'asc' } });
    },

    pacientes(_p: unknown, args: { q?: string }, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO');
      const q = args.q?.trim();
      return ctx.prisma.paciente.findMany({
        where: q
          ? {
              OR: [
                { ci: { contains: q, mode: 'insensitive' } },
                { nombre: { contains: q, mode: 'insensitive' } },
                { apellido: { contains: q, mode: 'insensitive' } },
              ],
            }
          : undefined,
        orderBy: { apellido: 'asc' },
      });
    },

    paciente(_p: unknown, args: { id: string }, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO');
      return ctx.prisma.paciente.findUnique({ where: { id: args.id } });
    },

    citas(_p: unknown, _a: unknown, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR', 'MEDICO');
      return ctx.prisma.cita.findMany({ orderBy: { fechaHora: 'desc' } });
    },

    async misCitas(_p: unknown, _a: unknown, ctx: Ctx) {
      const a = requireRole(ctx, 'PACIENTE', 'ADMINISTRADOR', 'MEDICO');
      const pac = await pacienteDelActor(ctx, a);
      if (!pac) return [];
      return ctx.prisma.cita.findMany({ where: { pacienteId: pac.id }, orderBy: { fechaHora: 'desc' } });
    },

    historiaPorPaciente(_p: unknown, args: { pacienteId: string }, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR', 'MEDICO');
      return ctx.prisma.historiaClinica.findUnique({ where: { pacienteId: args.pacienteId } });
    },
  },

  Mutation: {
    crearPaciente(_p: unknown, args: { input: PacienteData }, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO');
      return ctx.prisma.paciente.create({ data: toPacienteData(args.input) });
    },

    actualizarPaciente(_p: unknown, args: { id: string; input: PacienteData }, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO');
      return ctx.prisma.paciente.update({ where: { id: args.id }, data: toPacienteData(args.input) });
    },

    async crearCita(_p: unknown, args: { input: CitaData }, ctx: Ctx) {
      const a = requireRole(ctx, 'ADMINISTRADOR', 'MEDICO', 'PACIENTE');
      const i = args.input;
      if (a.rol === 'PACIENTE') {
        const pac = await pacienteDelActor(ctx, a);
        if (!pac || pac.id !== i.pacienteId) {
          throw new GraphQLError('Solo puedes agendar tus propias citas', { extensions: { code: 'FORBIDDEN' } });
        }
      }
      const fecha = new Date(i.fechaHora);
      if (!(fecha.getTime() > Date.now())) {
        throw new GraphQLError('La fecha de la cita debe ser futura', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      // Asignacion automatica: si nadie indico medico, se elige el menos cargado.
      const medicoUid = i.medicoUid || (await medicoMenosCargado(ctx));
      const cita = await ctx.prisma.cita.create({
        data: {
          pacienteId: i.pacienteId,
          medicoUid,
          especialidad: i.especialidad ?? null,
          fechaHora: i.fechaHora,
          urgencia: i.urgencia ?? null,
          motivo: i.motivo ?? null,
        },
      });
      // Push #1 (cualquier origen: bots n8n, Angular, app). Fire-and-forget:
      // si Expo o la BD fallan, la cita ya quedó creada y solo se loggea.
      void notificarCitaConfirmada(ctx, cita).catch((e) =>
        console.warn('[push] notificarCitaConfirmada falló:', e instanceof Error ? e.message : e),
      );
      return cita;
    },

    async cancelarCita(_p: unknown, args: { id: string }, ctx: Ctx) {
      const a = requireRole(ctx, 'ADMINISTRADOR', 'MEDICO', 'PACIENTE');
      const cita = await ctx.prisma.cita.findUnique({ where: { id: args.id } });
      if (!cita) throw new GraphQLError('Cita no encontrada', { extensions: { code: 'NOT_FOUND' } });
      if (cita.estado !== 'AGENDADA') {
        throw new GraphQLError('Solo se puede cancelar una cita AGENDADA', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      if (a.rol === 'PACIENTE') {
        const pac = await pacienteDelActor(ctx, a);
        if (!pac || pac.id !== cita.pacienteId) {
          throw new GraphQLError('Solo puedes cancelar tus propias citas', { extensions: { code: 'FORBIDDEN' } });
        }
      }
      return ctx.prisma.cita.update({ where: { id: args.id }, data: { estado: 'CANCELADA' } });
    },

    async crearEpisodio(_p: unknown, args: { input: EpisodioData }, ctx: Ctx) {
      const a = requireRole(ctx, 'ADMINISTRADOR', 'MEDICO');
      const i = args.input;
      // Episodio inmutable: solo se crea, nunca se edita ni borra.
      const episodio = await ctx.prisma.episodio.create({
        data: {
          historiaId: i.historiaId,
          citaId: i.citaId ?? null,
          medicoUid: a.uid,
          motivoConsulta: i.motivoConsulta ?? null,
          evolucion: i.evolucion ?? null,
          diagnosticoTexto: i.diagnosticoTexto ?? null,
        },
      });
      // Cierra el ciclo de vida: la cita atendida pasa a ATENDIDA y, si seguia
      // sin medico, queda a nombre del medico que la atendio.
      if (i.citaId) {
        const citaPrev = await ctx.prisma.cita.findUnique({ where: { id: i.citaId } });
        if (citaPrev) {
          await ctx.prisma.cita.update({
            where: { id: i.citaId },
            data: { estado: 'ATENDIDA', medicoUid: citaPrev.medicoUid || a.uid },
          });
        }
      }
      return episodio;
    },

    async cambiarRolUsuario(_p: unknown, args: { id: string; rol: Rol }, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR');
      const rol = await ctx.prisma.rol.findUnique({ where: { nombre: args.rol } });
      if (!rol) throw new GraphQLError('Rol invalido', { extensions: { code: 'BAD_USER_INPUT' } });
      return ctx.prisma.usuario.update({ where: { id: args.id }, data: { rolId: rol.id } });
    },

    async actualizarUsuario(_p: unknown, args: { id: string; nombre?: string | null; email?: string | null }, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR');
      const data: { nombre?: string; email?: string } = {};
      if (args.nombre != null && args.nombre.trim()) data.nombre = args.nombre.trim();
      if (args.email != null && args.email.trim()) data.email = args.email.trim().toLowerCase();
      if (Object.keys(data).length === 0) {
        throw new GraphQLError('Nada que actualizar', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      return ctx.prisma.usuario.update({ where: { id: args.id }, data });
    },

    async desactivarUsuario(_p: unknown, args: { id: string }, ctx: Ctx) {
      const a = requireRole(ctx, 'ADMINISTRADOR');
      const u = await ctx.prisma.usuario.findUnique({ where: { id: args.id } });
      if (!u) throw new GraphQLError('Usuario no encontrado', { extensions: { code: 'NOT_FOUND' } });
      if (u.supabaseUid === a.uid) {
        throw new GraphQLError('No puedes desactivar tu propia cuenta', { extensions: { code: 'FORBIDDEN' } });
      }
      return ctx.prisma.usuario.update({ where: { id: args.id }, data: { activo: false } });
    },

    activarUsuario(_p: unknown, args: { id: string }, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR');
      return ctx.prisma.usuario.update({ where: { id: args.id }, data: { activo: true } });
    },

    async crearUsuario(
      _p: unknown,
      args: {
        nombre: string; email: string; password: string; rol: Rol;
        ci?: string | null; apellido?: string | null;
        telefono?: string | null; fechaNacimiento?: Date | null;
      },
      ctx: Ctx,
    ) {
      requireRole(ctx, 'ADMINISTRADOR');
      const nombre = args.nombre?.trim();
      const email = args.email?.trim().toLowerCase();
      // Campos clinicos extra (solo se usan si el rol es PACIENTE).
      const ci = args.ci?.trim();
      const apellido = args.apellido?.trim();
      const telefono = args.telefono?.trim() || null;
      const fechaNacimiento = args.fechaNacimiento ?? null;
      const esPaciente = args.rol === 'PACIENTE';
      if (!nombre || !email || !args.password || args.password.length < 6) {
        throw new GraphQLError('Nombre, email y password (minimo 6 caracteres) son obligatorios', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      const rolRow = await ctx.prisma.rol.findUnique({ where: { nombre: args.rol } });
      if (!rolRow) throw new GraphQLError('Rol invalido', { extensions: { code: 'BAD_USER_INPUT' } });
      const dup = await ctx.prisma.usuario.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      if (dup) {
        throw new GraphQLError('Ya existe un usuario con ese email', { extensions: { code: 'BAD_USER_INPUT' } });
      }

      // Para PACIENTE creamos tambien su ficha (tabla paciente), que es la que
      // lleva el ci y el email por los que preguntan las automatizaciones (n8n).
      // Validamos TODO aqui, ANTES de tocar Supabase, para no dejar cuentas
      // huerfanas si la ficha no se puede crear (ci/email duplicado, etc.).
      if (esPaciente) {
        if (!ci) {
          throw new GraphQLError('El CI (cedula de identidad) es obligatorio para un paciente', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        if (!apellido) {
          throw new GraphQLError('El apellido es obligatorio para un paciente', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        const dupCi = await ctx.prisma.paciente.findUnique({ where: { ci } });
        if (dupCi) {
          throw new GraphQLError('Ya existe un paciente con ese CI', { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const dupPacEmail = await ctx.prisma.paciente.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        });
        if (dupPacEmail) {
          throw new GraphQLError('Ya existe un paciente con ese email', { extensions: { code: 'BAD_USER_INPUT' } });
        }
      }

      // 1) Crear la cuenta REAL de login en Supabase Auth (Admin API, service role).
      //    El rol viaja en app_metadata.role, que es lo que lee actorFromRequest.
      const issuer = process.env.SUPABASE_ISSUER ?? '';
      const base = (process.env.SUPABASE_URL ?? issuer.replace(/\/auth\/v1\/?$/, '')).replace(/\/$/, '');
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!base || !serviceKey) {
        throw new GraphQLError(
          'Falta configurar SUPABASE_SERVICE_ROLE_KEY (y SUPABASE_URL o SUPABASE_ISSUER) en el .env de ms-pacientes',
          { extensions: { code: 'INTERNAL_SERVER_ERROR' } },
        );
      }
      const resp = await fetch(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: args.password,
          email_confirm: true,
          app_metadata: { role: args.rol },
          user_metadata: { name: nombre },
        }),
      });
      const body: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new GraphQLError(
          `Supabase rechazo la creacion (${resp.status}): ${body?.msg ?? body?.message ?? JSON.stringify(body)}`,
          { extensions: { code: 'BAD_USER_INPUT', supabase: body } },
        );
      }
      const uid = body?.id;
      if (!uid) {
        throw new GraphQLError('Supabase no devolvio el id del usuario creado', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }

      // 2) Fila local con el uid REAL: el lazy-provisioning de me() la respetara tal cual.
      const usuario = await ctx.prisma.usuario.create({
        data: { supabaseUid: uid, nombre, email, rolId: rolRow.id, activo: true },
      });

      // 3) Si es PACIENTE, creamos su ficha clinica enlazada por supabaseUid.
      //    Comparte nombre/email con la cuenta y agrega los campos extra
      //    (ci, apellido, telefono, fechaNacimiento). Queda buscable por
      //    ci/email desde el primer momento (n8n) y ya vinculada a su login,
      //    sin depender del auto-enlace por email del primer inicio de sesion.
      if (esPaciente) {
        await ctx.prisma.paciente.create({
          data: {
            supabaseUid: uid,
            ci: ci!,
            nombre,
            apellido: apellido!,
            email,
            telefono,
            fechaNacimiento,
          },
        });
      }

      return usuario;
    },

    // ---------- Notificaciones push (Expo) ----------

    // Registra el ExpoPushToken del dispositivo del actor (cualquier rol
    // autenticado). Hace upsert por supabaseUid replicando el lazy-provisioning
    // de me(), por si la fila de usuario aún no existe.
    async registrarPushToken(_p: unknown, args: { token: string }, ctx: Ctx) {
      const a = requireAuth(ctx);
      const token = args.token?.trim();
      if (!token || !EXPO_TOKEN_RE.test(token)) {
        throw new GraphQLError(
          'Token de push inválido (se espera ExponentPushToken[...] o ExpoPushToken[...])',
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }
      const rol = await ctx.prisma.rol.findUnique({ where: { nombre: a.rol } });
      await ctx.prisma.usuario.upsert({
        where: { supabaseUid: a.uid },
        update: { expoPushToken: token },
        create: {
          supabaseUid: a.uid,
          nombre: a.nombre ?? a.email ?? a.uid,
          email: a.email ?? `${a.uid}@sin-email.local`,
          rolId: rol?.id ?? 4,
          expoPushToken: token,
        },
      });
      return true;
    },

    // Push #2 — Recordatorio 24h. Solo ADMINISTRADOR (lo dispara el cron n8n).
    async enviarRecordatorios(_p: unknown, _a: unknown, ctx: Ctx) {
      requireRole(ctx, 'ADMINISTRADOR');
      const { inicio, fin } = rangoMananaLaPaz(new Date());
      const citas = await ctx.prisma.cita.findMany({
        where: { estado: 'AGENDADA', fechaHora: { gte: inicio, lt: fin } },
        include: { paciente: { select: { supabaseUid: true } } },
      });
      let enviados = 0;
      for (const cita of citas) {
        // Cada cita en su propio try/catch: un fallo transitorio de BD en una
        // no debe abortar el lote y dejar al resto sin recordatorio.
        try {
          const uid = cita.paciente?.supabaseUid;
          if (!uid) continue;
          const u = await ctx.prisma.usuario.findUnique({
            where: { supabaseUid: uid },
            select: { expoPushToken: true },
          });
          if (!u?.expoPushToken) continue;
          let medicoNombre = 'tu médico';
          if (cita.medicoUid) {
            const med = await ctx.prisma.usuario.findUnique({
              where: { supabaseUid: cita.medicoUid },
              select: { nombre: true },
            });
            if (med?.nombre) medicoNombre = med.nombre;
          }
          await sendExpoPush(
            u.expoPushToken,
            'Recordatorio de cita 🔔',
            `Recuerda: mañana ${horaLaPaz(cita.fechaHora)} tienes cita con ${medicoNombre}`,
            { citaId: cita.id, tipo: 'recordatorio' },
          );
          enviados++;
        } catch (e) {
          console.warn('[push] recordatorio de cita', cita.id, 'falló:', e instanceof Error ? e.message : e);
        }
      }
      return enviados;
    },

    // Push #3 — Resultado listo. Lo invoca MS2 (Django) tras guardar un
    // diagnóstico, reenviando el JWT del médico. Roles MEDICO o ADMINISTRADOR.
    async notificarResultado(
      _p: unknown,
      args: { pacienteId: string; tipoEstudio?: string | null },
      ctx: Ctx,
    ) {
      requireRole(ctx, 'MEDICO', 'ADMINISTRADOR');
      const pac = await ctx.prisma.paciente.findUnique({
        where: { id: args.pacienteId },
        select: { supabaseUid: true },
      });
      if (!pac?.supabaseUid) return false;
      const u = await ctx.prisma.usuario.findUnique({
        where: { supabaseUid: pac.supabaseUid },
        select: { expoPushToken: true },
      });
      if (!u?.expoPushToken) return false;
      const tipo = args.tipoEstudio?.trim() || 'estudio';
      await sendExpoPush(
        u.expoPushToken,
        'Resultado disponible 📋',
        `Tu resultado de ${tipo} ya está disponible`,
        { pacienteId: args.pacienteId, tipo: 'resultado' },
      );
      return true;
    },
  },

  Usuario: {
    async rol(parent: { rolId: number; rol?: { nombre?: string } | null }, _a: unknown, ctx: Ctx) {
      const r = parent.rol ?? (await ctx.prisma.rol.findUnique({ where: { id: parent.rolId } }));
      return (r as { nombre?: string } | null)?.nombre ?? null;
    },
  },

  Paciente: {
    citas(parent: { id: string }, _a: unknown, ctx: Ctx) {
      return ctx.prisma.cita.findMany({ where: { pacienteId: parent.id }, orderBy: { fechaHora: 'desc' } });
    },
    historia(parent: { id: string }, _a: unknown, ctx: Ctx) {
      return ctx.prisma.historiaClinica.findUnique({ where: { pacienteId: parent.id } });
    },
    // Token de push del paciente, vía el usuario vinculado por supabaseUid.
    // null si la ficha no está vinculada a una cuenta o no registró la app.
    async pushToken(parent: { supabaseUid: string | null }, _a: unknown, ctx: Ctx) {
      if (!parent.supabaseUid) return null;
      const u = await ctx.prisma.usuario.findUnique({
        where: { supabaseUid: parent.supabaseUid },
        select: { expoPushToken: true },
      });
      return u?.expoPushToken ?? null;
    },
  },

  Cita: {
    paciente(parent: { pacienteId: string }, _a: unknown, ctx: Ctx) {
      return ctx.prisma.paciente.findUnique({ where: { id: parent.pacienteId } });
    },
    medico(parent: { medicoUid: string }, _a: unknown, ctx: Ctx) {
      if (!parent.medicoUid) return null;
      return ctx.prisma.usuario.findUnique({ where: { supabaseUid: parent.medicoUid } });
    },
  },

  HistoriaClinica: {
    episodios(parent: { id: string }, _a: unknown, ctx: Ctx) {
      return ctx.prisma.episodio.findMany({ where: { historiaId: parent.id }, orderBy: { fecha: 'asc' } });
    },
  },
};

// ---------- helpers de tipado de inputs ----------
interface PacienteData {
  ci: string; nombre: string; apellido: string;
  telefono?: string | null; email?: string | null;
  fechaNacimiento?: Date | null; supabaseUid?: string | null;
}
interface CitaData {
  pacienteId: string; medicoUid?: string | null; especialidad?: string | null;
  fechaHora: Date; urgencia?: string | null; motivo?: string | null;
}
interface EpisodioData {
  historiaId: string; citaId?: string | null;
  motivoConsulta?: string | null; evolucion?: string | null; diagnosticoTexto?: string | null;
}

function toPacienteData(i: PacienteData) {
  return {
    ci: i.ci,
    nombre: i.nombre,
    apellido: i.apellido,
    telefono: i.telefono ?? null,
    email: i.email ?? null,
    fechaNacimiento: i.fechaNacimiento ?? null,
    supabaseUid: i.supabaseUid ?? null,
  };
}
