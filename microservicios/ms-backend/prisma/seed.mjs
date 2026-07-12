// Seed de MS1 (ms-pacientes) — COHERENTE con Supabase Auth.
//
// Obtiene los UID reales desde el Admin API de Supabase EN RUNTIME. Nunca
// hardcodea uids ni usa placeholders 'seed-*'. Si Supabase no responde o falta
// alguno de los 5 emails canonicos -> aborta con process.exit(1) (regla dura:
// prohibido degradar a placeholders).
//
// Idempotente: upsert por id fijo; correrlo dos veces reproduce el mismo estado.
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const prisma = new PrismaClient();

// --- Parseo manual del .env (sin dependencias nuevas) ---
function loadEnv() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  const env = { ...process.env };
  let txt = '';
  try { txt = readFileSync(envPath, 'utf8'); } catch { /* sin .env: usar process.env */ }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (env[m[1]] === undefined) env[m[1]] = v; // el .env no pisa variables ya presentes
  }
  return env;
}

// --- Admin API de Supabase: email (lowercase) -> uid ---
async function fetchSupabaseUids(env) {
  const issuer = env.SUPABASE_ISSUER || '';
  const base = (env.SUPABASE_URL || issuer.replace(/\/auth\/v1\/?$/, '')).replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    throw new Error('Faltan SUPABASE_SERVICE_ROLE_KEY y/o SUPABASE_URL/SUPABASE_ISSUER en el .env de ms-pacientes');
  }
  const resp = await fetch(`${base}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Admin API de Supabase respondio ${resp.status}: ${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  const users = Array.isArray(data) ? data : (data.users || []);
  const map = new Map();
  for (const u of users) if (u && u.email) map.set(u.email.toLowerCase(), u.id);
  return map;
}

// Emails canonicos de los 5 usuarios reales (fuente de verdad: Supabase Auth).
const EMAILS = {
  admin: 'admin@clinica.com',
  medico: 'medico@clinica.com',
  farma: 'farma@clinica.com',
  carlos: 'carlos.rodriguez@example.com',
  paco: 'paco.pantera@example.com',
};

const roles = [
  { id: 1, nombre: 'ADMINISTRADOR', descripcion: 'Acceso total al sistema, gestion de usuarios y BI' },
  { id: 2, nombre: 'MEDICO', descripcion: 'Emite recetas, dispara blockchain, ve historia clinica' },
  { id: 3, nombre: 'FARMACEUTICO', descripcion: 'Caja, inventario, dispensacion, verificar recetas' },
  { id: 4, nombre: 'PACIENTE', descripcion: 'Consulta sus facturas y recetas' },
];

// IDs locales FIJOS (las migraciones de MS3 referencian algunos de estos UUIDs).
const ID = {
  admin: '11111111-1111-1111-1111-111111111111',
  medico: '22222222-2222-2222-2222-222222222222',
  farma: '33333333-3333-3333-3333-333333333333',
  carlosU: '44444444-4444-4444-4444-444444444444',
  pacoU: '55555555-5555-5555-5555-555555555555',
  carlosP: 'aaaa1111-aaaa-1111-aaaa-111111111111',
  pacoP: 'aaaa2222-aaaa-2222-aaaa-222222222222',
  histC: 'b0000001-0000-4000-8000-000000000001',
  histP: 'b0000002-0000-4000-8000-000000000002',
  cita1: 'c0000001-0000-4000-8000-000000000001',
  cita2: 'c0000002-0000-4000-8000-000000000002',
  cita3: 'c0000003-0000-4000-8000-000000000003',
  episC: 'e0000001-0000-4000-8000-000000000001',
  episP: 'e0000002-0000-4000-8000-000000000002',
};

async function main() {
  const env = loadEnv();
  const uids = await fetchSupabaseUids(env);
  const uid = (email) => uids.get(email);

  // Si faltan usuarios, los creamos via Supabase Admin API
  const faltan = Object.keys(EMAILS).filter((key) => !uid(EMAILS[key]));
  
  if (faltan.length > 0) {
    console.log(`Faltan ${faltan.length} usuarios en Supabase Auth. Creandolos automaticamente...`);
    const issuer = env.SUPABASE_ISSUER || '';
    const base = (env.SUPABASE_URL || issuer.replace(/\/auth\/v1\/?$/, '')).replace(/\/$/, '');
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    
    for (const keyName of faltan) {
      const email = EMAILS[keyName];
      console.log(`Creando usuario en Supabase Auth: ${email}`);
      const resp = await fetch(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          email: email,
          password: 'Password123!',
          email_confirm: true
        })
      });
      
      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Error creando usuario ${email} en Supabase: ${errBody}`);
      }
      
      const newUser = await resp.json();
      uids.set(email.toLowerCase(), newUser.id);
    }
  }

  const usuarios = [
    { id: ID.admin, supabaseUid: uid(EMAILS.admin), nombre: 'Administrador Demo', email: EMAILS.admin, rolId: 1 },
    { id: ID.medico, supabaseUid: uid(EMAILS.medico), nombre: 'Dr. Juan Perez', email: EMAILS.medico, rolId: 2 },
    { id: ID.farma, supabaseUid: uid(EMAILS.farma), nombre: 'Maria Gonzalez', email: EMAILS.farma, rolId: 3 },
    { id: ID.carlosU, supabaseUid: uid(EMAILS.carlos), nombre: 'Carlos Rodriguez', email: EMAILS.carlos, rolId: 4 },
    { id: ID.pacoU, supabaseUid: uid(EMAILS.paco), nombre: 'Paco Pantera', email: EMAILS.paco, rolId: 4 },
  ];

  const pacientes = [
    { id: ID.carlosP, supabaseUid: uid(EMAILS.carlos), ci: '1234567', nombre: 'Carlos', apellido: 'Rodriguez', telefono: '70011223', email: EMAILS.carlos, fechaNacimiento: new Date('1985-04-12') },
    { id: ID.pacoP, supabaseUid: uid(EMAILS.paco), ci: '7777777', nombre: 'Paco', apellido: 'Pantera', telefono: '70099887', email: EMAILS.paco, fechaNacimiento: new Date('1991-07-07') },
  ];

  const MEDICO_UID = uid(EMAILS.medico);

  for (const r of roles) {
    await prisma.rol.upsert({ where: { id: r.id }, update: { nombre: r.nombre, descripcion: r.descripcion }, create: r });
  }
  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { id: u.id },
      update: { supabaseUid: u.supabaseUid, nombre: u.nombre, email: u.email, rolId: u.rolId, activo: true },
      create: u,
    });
  }
  for (const p of pacientes) {
    await prisma.paciente.upsert({
      where: { id: p.id },
      update: { supabaseUid: p.supabaseUid, ci: p.ci, nombre: p.nombre, apellido: p.apellido, telefono: p.telefono, email: p.email, fechaNacimiento: p.fechaNacimiento },
      create: p,
    });
  }

  // Historias clinicas (Carlos y Paco)
  await prisma.historiaClinica.upsert({ where: { pacienteId: ID.carlosP }, update: {}, create: { id: ID.histC, pacienteId: ID.carlosP, estado: 'ABIERTA' } });
  await prisma.historiaClinica.upsert({ where: { pacienteId: ID.pacoP }, update: {}, create: { id: ID.histP, pacienteId: ID.pacoP, estado: 'ABIERTA' } });

  // Citas (estados variados) con medicoUid REAL del medico
  await prisma.cita.upsert({ where: { id: ID.cita1 }, update: { medicoUid: MEDICO_UID }, create: { id: ID.cita1, pacienteId: ID.carlosP, medicoUid: MEDICO_UID, especialidad: 'Medicina General', fechaHora: new Date('2026-06-10T15:00:00Z'), estado: 'ATENDIDA', motivo: 'Dolor postoperatorio' } });
  await prisma.cita.upsert({ where: { id: ID.cita2 }, update: { medicoUid: MEDICO_UID }, create: { id: ID.cita2, pacienteId: ID.carlosP, medicoUid: MEDICO_UID, especialidad: 'Traumatologia', fechaHora: new Date('2026-06-20T10:30:00Z'), estado: 'AGENDADA', urgencia: 'MEDIA', motivo: 'Control' } });
  await prisma.cita.upsert({ where: { id: ID.cita3 }, update: { medicoUid: MEDICO_UID }, create: { id: ID.cita3, pacienteId: ID.pacoP, medicoUid: MEDICO_UID, especialidad: 'Medicina General', fechaHora: new Date('2026-06-18T09:00:00Z'), estado: 'AGENDADA', motivo: 'Consulta general' } });

  // Episodios (Carlos vinculado a su cita atendida; Paco chequeo)
  await prisma.episodio.upsert({ where: { id: ID.episC }, update: { medicoUid: MEDICO_UID }, create: { id: ID.episC, historiaId: ID.histC, citaId: ID.cita1, medicoUid: MEDICO_UID, motivoConsulta: 'Dolor postoperatorio agudo', evolucion: 'Paciente estable, dolor controlado con analgesia', diagnosticoTexto: 'Dolor postquirurgico en manejo' } });
  await prisma.episodio.upsert({ where: { id: ID.episP }, update: { medicoUid: MEDICO_UID }, create: { id: ID.episP, historiaId: ID.histP, medicoUid: MEDICO_UID, motivoConsulta: 'Chequeo general', evolucion: 'Sin hallazgos relevantes', diagnosticoTexto: 'Paciente sano' } });

  console.log('Seed MS1 OK: %d roles, %d usuarios, %d pacientes, 2 historias, 3 citas, 2 episodios', roles.length, usuarios.length, pacientes.length);
  console.log('UIDs reales aplicados desde Supabase Admin API (cero placeholders seed-*).');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('SEED FALLO:', e && e.message ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
