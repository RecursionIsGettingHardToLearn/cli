import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import crypto from 'crypto';

const prisma = new PrismaClient();
const { Client } = pg;

const javaDbUrl = 'postgresql://postgres.qobedozcifsrfdoktwrv:8FLiKvwU8z%40MJ3%40@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

async function main() {
  console.log('--- Iniciando Seeding Global ---');

  // 1. Obtener UIDs reales
  const medico = await prisma.usuario.findFirst({ where: { rol: { nombre: 'MEDICO' } } });
  if (!medico) throw new Error('No se encontro ningun medico en la BD de Prisma. Por favor crea uno primero.');
  const medicoUid = medico.supabaseUid;
  const medicoNombre = medico.nombre;

  const admin = await prisma.usuario.findFirst({ where: { rol: { nombre: 'ADMINISTRADOR' } } });
  const adminId = admin?.supabaseUid || medicoUid; // Fallback

  console.log(`Medico encontrado: ${medicoNombre} (${medicoUid})`);

  // 2. Conectar a Java DB
  const pgClient = new Client({ connectionString: javaDbUrl });
  await pgClient.connect();
  console.log('Conectado a la BD de MS3 (Java)');

  // 3. Crear Pacientes en Prisma
  const p1 = await prisma.paciente.create({
    data: {
      ci: `CI-${Math.floor(Math.random()*10000)}`,
      nombre: 'Juan',
      apellido: 'Perez',
      telefono: '555-1010',
      fechaNacimiento: new Date('1985-05-15T00:00:00Z'),
    }
  });

  const p2 = await prisma.paciente.create({
    data: {
      ci: `CI-${Math.floor(Math.random()*10000)}`,
      nombre: 'Maria',
      apellido: 'Gomez',
      telefono: '555-2020',
      fechaNacimiento: new Date('1990-10-20T00:00:00Z'),
    }
  });
  console.log(`Pacientes creados: ${p1.id}, ${p2.id}`);

  // 4. Crear Citas y Episodios en Prisma
  const cita1 = await prisma.cita.create({
    data: {
      pacienteId: p1.id,
      medicoUid: medicoUid,
      especialidad: 'Medicina General',
      fechaHora: new Date(Date.now() - 86400000), // Ayer
      estado: 'ATENDIDA',
      motivo: 'Dolor de cabeza agudo'
    }
  });

  const historia1 = await prisma.historiaClinica.create({
    data: { pacienteId: p1.id }
  });

  await prisma.episodio.create({
    data: {
      historiaId: historia1.id,
      citaId: cita1.id,
      medicoUid: medicoUid,
      motivoConsulta: 'Dolor de cabeza agudo',
      diagnosticoTexto: 'Migraña tensional'
    }
  });
  console.log(`Cita y Episodio creados para ${p1.nombre}`);

  // 5. Insercion en Java DB (MS3)
  // Categorias
  const catRes = await pgClient.query(`INSERT INTO categoria (nombre, descripcion) VALUES ('Analgésicos', 'Para el dolor') ON CONFLICT (nombre) DO UPDATE SET descripcion=EXCLUDED.descripcion RETURNING id`);
  const catId = catRes.rows[0].id;

  const catRes2 = await pgClient.query(`INSERT INTO categoria (nombre, descripcion) VALUES ('Antibióticos', 'Para infecciones') ON CONFLICT (nombre) DO UPDATE SET descripcion=EXCLUDED.descripcion RETURNING id`);
  const catId2 = catRes2.rows[0].id;

  // Medicamento
  const medId = crypto.randomUUID();
  await pgClient.query(`
    INSERT INTO medicamento (id, nombre, descripcion, categoria_id, precio_venta, requiere_receta, stock_minimo, activo)
    VALUES ($1, 'Paracetamol 500mg', 'Alivio del dolor', $2, 15.50, false, 10, true)
  `, [medId, catId]);

  const medId2 = crypto.randomUUID();
  await pgClient.query(`
    INSERT INTO medicamento (id, nombre, descripcion, categoria_id, precio_venta, requiere_receta, stock_minimo, activo)
    VALUES ($1, 'Amoxicilina 500mg', 'Infecciones bacterianas', $2, 45.00, true, 5, true)
  `, [medId2, catId2]);

  // Proveedor
  const provId = crypto.randomUUID();
  await pgClient.query(`
    INSERT INTO proveedor (id, nombre, nit) VALUES ($1, 'FarmaCorp', '123456789')
  `, [provId]);

  // Lote
  const loteId = crypto.randomUUID();
  await pgClient.query(`
    INSERT INTO lote (id, medicamento_id, proveedor_id, codigo_lote, fecha_vencimiento, cantidad_inicial, cantidad_actual, precio_compra)
    VALUES ($1, $2, $3, 'LOTE-2026', '2026-12-31', 100, 100, 10.00)
  `, [loteId, medId, provId]);

  const loteId2 = crypto.randomUUID();
  await pgClient.query(`
    INSERT INTO lote (id, medicamento_id, proveedor_id, codigo_lote, fecha_vencimiento, cantidad_inicial, cantidad_actual, precio_compra)
    VALUES ($1, $2, $3, 'LOTE-2027', '2027-12-31', 50, 50, 30.00)
  `, [loteId2, medId2, provId]);

  console.log('Inventario insertado en MS3');

  // 6. Receta para Juan Perez (conectada a su UUID de Prisma!)
  const recetaId = crypto.randomUUID();
  await pgClient.query(`
    INSERT INTO receta (id, paciente_id, medico_nombre, medico_uid, diagnostico, estado)
    VALUES ($1, $2, $3, $4, 'Migraña tensional', 'EMITIDA')
  `, [recetaId, p1.id, medicoNombre, medicoUid]);

  await pgClient.query(`
    INSERT INTO detalle_receta (receta_id, medicamento_id, cantidad, posologia)
    VALUES ($1, $2, 2, 'Tomar 1 cada 8 horas')
  `, [recetaId, medId]);

  // Receta para Maria
  const recetaId2 = crypto.randomUUID();
  await pgClient.query(`
    INSERT INTO receta (id, paciente_id, medico_nombre, medico_uid, diagnostico, estado)
    VALUES ($1, $2, $3, $4, 'Infección leve', 'EMITIDA')
  `, [recetaId2, p2.id, medicoNombre, medicoUid]);

  await pgClient.query(`
    INSERT INTO detalle_receta (receta_id, medicamento_id, cantidad, posologia)
    VALUES ($1, $2, 1, 'Tomar 1 cada 12 horas')
  `, [recetaId2, medId2]);

  console.log('Recetas cruzadas insertadas en MS3');

  // 7. Factura para Juan Perez (conectada a su UUID de Prisma!)
  const facturaId = crypto.randomUUID();
  await pgClient.query(`
    INSERT INTO factura (id, numero, paciente_id, usuario_id, subtotal, descuento, total, metodo_pago, estado)
    VALUES ($1, 'FAC-' || floor(random() * 100000)::text, $2, $3, 31.00, 0, 31.00, 'EFECTIVO', 'PAGADA')
  `, [facturaId, p1.id, adminId]); // Ojo, pasamos UUID de p1

  await pgClient.query(`
    INSERT INTO detalle_factura (factura_id, medicamento_id, lote_id, receta_id, cantidad, precio_unitario, subtotal)
    VALUES ($1, $2, $3, $4, 2, 15.50, 31.00)
  `, [facturaId, medId, loteId, recetaId]);

  console.log('Facturas cruzadas insertadas en MS3');

  await pgClient.end();
  await prisma.$disconnect();

  console.log('--- Seeding Global Completado ---');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
