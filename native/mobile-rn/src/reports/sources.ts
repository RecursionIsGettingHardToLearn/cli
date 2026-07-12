// ---------------------------------------------------------------------------
// Definiciones de fuentes de datos y reportes para la seccion REPORTES.
//
// Cada fuente declara:
//  - roles: que roles pueden consultarla (espejo de los guards del backend:
//    requireRole en Node y @PreAuthorize en Spring Boot).
//  - query GraphQL + extract (como sacar el array de la respuesta).
//  - fields: catalogo de columnas disponibles (usado por el reporte dinamico).
//  - postFilter opcional (ej. el medico filtra la agenda por su medicoUid,
//    porque el backend devuelve todas las citas para ADMIN/MEDICO).
//
// Los reportes estaticos referencian una fuente, fijan columnas, aplican un
// filtro opcional y calculan un resumen (totales / conteos).
// ---------------------------------------------------------------------------
import type { DocumentNode } from 'graphql';
import type { RolUsuario } from '../config/supabase';
import {
  CITAS,
  MIS_CITAS,
  PACIENTES,
  USUARIOS,
  FACTURAS,
  MIS_FACTURAS_PACIENTE,
  MIS_RECETAS_MEDICO,
  MIS_RECETAS_PACIENTE,
  MEDICAMENTOS,
  BI_VENTAS_DIARIAS,
  BI_TOP_MEDICAMENTOS,
  BI_INVENTARIO_CRITICO,
} from '../graphql/queries';
import { money, fmtFecha, fmtFechaHora } from '../ui/kit';

export interface ReportCtx {
  uid: string;
  rol: RolUsuario;
}

export interface ReportField {
  key: string;
  label: string;
  /** Ancho de columna en px para la tabla. */
  width?: number;
  get: (row: any) => string;
}

export interface ReportSource {
  id: string;
  label: string;
  roles: RolUsuario[];
  query: DocumentNode;
  variables?: (ctx: ReportCtx) => Record<string, any>;
  extract: (data: any) => any[];
  postFilter?: (rows: any[], ctx: ReportCtx) => any[];
  fields: ReportField[];
}

export interface ResumenItem {
  label: string;
  value: string;
}

export interface StaticReport {
  id: string;
  label: string;
  descripcion: string;
  roles: RolUsuario[];
  sourceId: string;
  /** Claves de ReportField de la fuente, en orden. */
  columns: string[];
  filter?: (row: any, ctx: ReportCtx) => boolean;
  resumen?: (rows: any[]) => ResumenItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const s = (v: any): string => (v === null || v === undefined ? '' : String(v));
const siNo = (v: any): string => (v ? 'Si' : 'No');

function countBy(rows: any[], get: (r: any) => string): ResumenItem[] {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    const k = get(r) || '(sin dato)';
    acc[k] = (acc[k] ?? 0) + 1;
  }
  return Object.entries(acc)
    .sort((a, b) => b[1] - a[1])
    .map(([label, n]) => ({ label, value: String(n) }));
}

function sumBy(rows: any[], get: (r: any) => number): number {
  return rows.reduce((t, r) => t + (Number(get(r)) || 0), 0);
}

const hoyISO = () => new Date().toISOString().slice(0, 10);
const hace = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Campos por entidad (reutilizados entre fuentes)
// ---------------------------------------------------------------------------
const CITA_FIELDS: ReportField[] = [
  { key: 'fecha', label: 'Fecha y hora', width: 130, get: r => fmtFechaHora(r.fechaHora) },
  { key: 'paciente', label: 'Paciente', width: 150, get: r => r.paciente ? `${s(r.paciente.nombre)} ${s(r.paciente.apellido)}`.trim() : '' },
  { key: 'ci', label: 'CI', width: 90, get: r => s(r.paciente?.ci) },
  { key: 'medico', label: 'Medico', width: 130, get: r => s(r.medico?.nombre) },
  { key: 'especialidad', label: 'Especialidad', width: 120, get: r => s(r.especialidad) },
  { key: 'urgencia', label: 'Urgencia', width: 90, get: r => s(r.urgencia) },
  { key: 'estado', label: 'Estado', width: 100, get: r => s(r.estado) },
  { key: 'motivo', label: 'Motivo', width: 170, get: r => s(r.motivo) },
];

const FACTURA_FIELDS: ReportField[] = [
  { key: 'numero', label: 'Numero', width: 100, get: r => s(r.numero) },
  { key: 'fecha', label: 'Fecha', width: 130, get: r => fmtFechaHora(r.fecha) },
  { key: 'subtotal', label: 'Subtotal', width: 95, get: r => money(r.subtotal) },
  { key: 'descuento', label: 'Descuento', width: 95, get: r => money(r.descuento) },
  { key: 'total', label: 'Total', width: 95, get: r => money(r.total) },
  { key: 'metodoPago', label: 'Metodo de pago', width: 120, get: r => s(r.metodoPago) },
  { key: 'estado', label: 'Estado', width: 100, get: r => s(r.estado) },
  { key: 'items', label: 'Items', width: 200, get: r => (r.detalles ?? []).map((d: any) => `${s(d.medicamento?.nombre)} x${s(d.cantidad)}`).join(', ') },
];

const RECETA_BASE: ReportField[] = [
  { key: 'fecha', label: 'Fecha emision', width: 130, get: r => fmtFechaHora(r.fechaEmision) },
  { key: 'estado', label: 'Estado', width: 110, get: r => s(r.estado) },
  { key: 'controlado', label: 'Controlado', width: 90, get: r => siNo(r.controlado) },
  { key: 'medicamentos', label: 'Medicamentos', width: 200, get: r => (r.detalles ?? []).map((d: any) => `${s(d.medicamento?.nombre)} x${s(d.cantidad)}`).join(', ') },
  { key: 'blockchain', label: 'Blockchain', width: 100, get: r => (r.blockchainTx ? 'Registrada' : 'No') },
];

// ---------------------------------------------------------------------------
// FUENTES DE DATOS
// ---------------------------------------------------------------------------
export const SOURCES: ReportSource[] = [
  {
    id: 'citas',
    label: 'Citas',
    roles: ['ADMINISTRADOR', 'MEDICO'],
    query: CITAS,
    extract: d => d?.citas ?? [],
    // El medico solo ve su propia agenda.
    postFilter: (rows, ctx) => (ctx.rol === 'MEDICO' ? rows.filter(r => r.medicoUid === ctx.uid) : rows),
    fields: CITA_FIELDS,
  },
  {
    id: 'mis_citas',
    label: 'Mis citas',
    roles: ['PACIENTE'],
    query: MIS_CITAS,
    extract: d => d?.misCitas ?? [],
    fields: CITA_FIELDS.filter(f => !['paciente', 'ci'].includes(f.key)),
  },
  {
    id: 'pacientes',
    label: 'Pacientes',
    roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO'],
    query: PACIENTES,
    variables: () => ({ q: null }),
    extract: d => d?.pacientes ?? [],
    fields: [
      { key: 'ci', label: 'CI', width: 95, get: r => s(r.ci) },
      { key: 'nombre', label: 'Nombre', width: 120, get: r => s(r.nombre) },
      { key: 'apellido', label: 'Apellido', width: 120, get: r => s(r.apellido) },
      { key: 'telefono', label: 'Telefono', width: 110, get: r => s(r.telefono) },
      { key: 'email', label: 'Email', width: 180, get: r => s(r.email) },
      { key: 'nacimiento', label: 'F. nacimiento', width: 110, get: r => fmtFecha(r.fechaNacimiento) },
    ],
  },
  {
    id: 'usuarios',
    label: 'Usuarios del sistema',
    roles: ['ADMINISTRADOR'],
    query: USUARIOS,
    extract: d => d?.usuarios ?? [],
    fields: [
      { key: 'nombre', label: 'Nombre', width: 150, get: r => s(r.nombre) },
      { key: 'email', label: 'Email', width: 190, get: r => s(r.email) },
      { key: 'rol', label: 'Rol', width: 130, get: r => s(r.rol) },
      { key: 'activo', label: 'Activo', width: 70, get: r => siNo(r.activo) },
    ],
  },
  {
    id: 'facturas',
    label: 'Facturas (ventas)',
    roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
    query: FACTURAS,
    extract: d => d?.facturas ?? [],
    fields: FACTURA_FIELDS,
  },
  {
    id: 'mis_facturas',
    label: 'Mis facturas',
    roles: ['PACIENTE'],
    query: MIS_FACTURAS_PACIENTE,
    extract: d => d?.misFacturas ?? [],
    fields: FACTURA_FIELDS.filter(f => !['subtotal', 'descuento'].includes(f.key)),
  },
  {
    id: 'recetas_emitidas',
    label: 'Recetas emitidas',
    roles: ['MEDICO'],
    query: MIS_RECETAS_MEDICO,
    extract: d => d?.misRecetas ?? [],
    fields: [
      RECETA_BASE[0],
      { key: 'paciente', label: 'Paciente', width: 150, get: r => r.paciente ? `${s(r.paciente.nombre)} ${s(r.paciente.apellido)}`.trim() : '' },
      ...RECETA_BASE.slice(1),
    ],
  },
  {
    id: 'mis_recetas',
    label: 'Mis recetas',
    roles: ['PACIENTE'],
    query: MIS_RECETAS_PACIENTE,
    extract: d => d?.misRecetasPaciente ?? [],
    fields: [
      RECETA_BASE[0],
      { key: 'medico', label: 'Medico', width: 140, get: r => s(r.medicoNombre) },
      { key: 'diagnostico', label: 'Diagnostico', width: 170, get: r => s(r.diagnostico) },
      ...RECETA_BASE.slice(1),
    ],
  },
  {
    id: 'medicamentos',
    label: 'Catalogo de medicamentos',
    roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'],
    query: MEDICAMENTOS,
    variables: () => ({ q: null, activo: null }),
    extract: d => d?.medicamentos ?? [],
    fields: [
      { key: 'nombre', label: 'Nombre', width: 150, get: r => s(r.nombre) },
      { key: 'categoria', label: 'Categoria', width: 120, get: r => s(r.categoria?.nombre) },
      { key: 'precio', label: 'Precio venta', width: 100, get: r => money(r.precioVenta) },
      { key: 'stockMin', label: 'Stock min.', width: 85, get: r => s(r.stockMinimo) },
      { key: 'receta', label: 'Requiere receta', width: 110, get: r => siNo(r.requiereReceta) },
      { key: 'controlado', label: 'Controlado', width: 90, get: r => siNo(r.controlado) },
      { key: 'activo', label: 'Activo', width: 70, get: r => siNo(r.activo) },
    ],
  },
  {
    id: 'bi_ventas',
    label: 'Ventas diarias (BI, 30 dias)',
    roles: ['ADMINISTRADOR'],
    query: BI_VENTAS_DIARIAS,
    variables: () => ({ desde: hace(30), hasta: hoyISO() }),
    extract: d => d?.biVentasDiarias ?? [],
    fields: [
      { key: 'dia', label: 'Dia', width: 100, get: r => fmtFecha(r.dia) },
      { key: 'numFacturas', label: 'N. facturas', width: 90, get: r => s(r.numFacturas) },
      { key: 'totalVendido', label: 'Total vendido', width: 110, get: r => money(r.totalVendido) },
      { key: 'ticket', label: 'Ticket promedio', width: 115, get: r => money(r.ticketPromedio) },
    ],
  },
  {
    id: 'bi_top',
    label: 'Top medicamentos vendidos (BI)',
    roles: ['ADMINISTRADOR'],
    query: BI_TOP_MEDICAMENTOS,
    variables: () => ({ limit: 20 }),
    extract: d => d?.biTopMedicamentos ?? [],
    fields: [
      { key: 'medicamento', label: 'Medicamento', width: 160, get: r => s(r.medicamento) },
      { key: 'unidades', label: 'Unidades', width: 85, get: r => s(r.unidadesVendidas) },
      { key: 'monto', label: 'Monto total', width: 100, get: r => money(r.montoTotal) },
      { key: 'numFacturas', label: 'N. facturas', width: 90, get: r => s(r.numFacturas) },
    ],
  },
  {
    id: 'bi_stock',
    label: 'Inventario critico (BI)',
    roles: ['ADMINISTRADOR'],
    query: BI_INVENTARIO_CRITICO,
    extract: d => d?.biInventarioCritico ?? [],
    fields: [
      { key: 'medicamento', label: 'Medicamento', width: 160, get: r => s(r.medicamento) },
      { key: 'stockActual', label: 'Stock actual', width: 95, get: r => s(r.stockActual) },
      { key: 'stockMinimo', label: 'Stock minimo', width: 95, get: r => s(r.stockMinimo) },
      { key: 'nivel', label: 'Nivel', width: 90, get: r => s(r.nivel) },
    ],
  },
];

// ---------------------------------------------------------------------------
// REPORTES ESTATICOS (tablas ya definidas, con resumen)
// ---------------------------------------------------------------------------
export const STATIC_REPORTS: StaticReport[] = [
  // ---- Citas ----
  {
    id: 'citas_estado',
    label: 'Citas por estado',
    descripcion: 'Todas las citas con conteo por estado (agendadas, atendidas, canceladas).',
    roles: ['ADMINISTRADOR', 'MEDICO'],
    sourceId: 'citas',
    columns: ['fecha', 'paciente', 'especialidad', 'urgencia', 'estado'],
    resumen: rows => [
      { label: 'Total de citas', value: String(rows.length) },
      ...countBy(rows, r => s(r.estado)),
    ],
  },
  {
    id: 'agenda_proxima',
    label: 'Citas agendadas (proximas)',
    descripcion: 'Citas en estado AGENDADA con fecha de hoy en adelante.',
    roles: ['ADMINISTRADOR', 'MEDICO'],
    sourceId: 'citas',
    columns: ['fecha', 'paciente', 'medico', 'especialidad', 'urgencia'],
    filter: r => r.estado === 'AGENDADA' && new Date(r.fechaHora) >= new Date(new Date().toDateString()),
    resumen: rows => [
      { label: 'Citas pendientes de atender', value: String(rows.length) },
      ...countBy(rows, r => s(r.urgencia)).map(i => ({ label: `Urgencia ${i.label}`, value: i.value })),
    ],
  },
  {
    id: 'mis_citas_proximas',
    label: 'Mis proximas citas',
    descripcion: 'Tus citas agendadas de hoy en adelante.',
    roles: ['PACIENTE'],
    sourceId: 'mis_citas',
    columns: ['fecha', 'medico', 'especialidad', 'estado'],
    filter: r => r.estado === 'AGENDADA' && new Date(r.fechaHora) >= new Date(new Date().toDateString()),
    resumen: rows => [{ label: 'Citas proximas', value: String(rows.length) }],
  },
  {
    id: 'mis_citas_historial',
    label: 'Historial de mis citas',
    descripcion: 'Todas tus citas con conteo por estado.',
    roles: ['PACIENTE'],
    sourceId: 'mis_citas',
    columns: ['fecha', 'medico', 'especialidad', 'estado', 'motivo'],
    resumen: rows => [
      { label: 'Total', value: String(rows.length) },
      ...countBy(rows, r => s(r.estado)),
    ],
  },
  // ---- Ventas / facturas ----
  {
    id: 'ventas_metodo',
    label: 'Ventas por metodo de pago',
    descripcion: 'Facturas no anuladas agrupadas por metodo de pago, con total recaudado.',
    roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
    sourceId: 'facturas',
    columns: ['numero', 'fecha', 'metodoPago', 'total', 'estado'],
    filter: r => r.estado !== 'ANULADA',
    resumen: rows => {
      const porMetodo: Record<string, number> = {};
      for (const r of rows) porMetodo[s(r.metodoPago)] = (porMetodo[s(r.metodoPago)] ?? 0) + (Number(r.total) || 0);
      return [
        { label: 'Facturas', value: String(rows.length) },
        { label: 'Total recaudado', value: money(sumBy(rows, r => r.total)) },
        ...Object.entries(porMetodo).map(([m, t]) => ({ label: m, value: money(t) })),
      ];
    },
  },
  {
    id: 'facturas_pendientes',
    label: 'Facturas pendientes de pago',
    descripcion: 'Facturas en estado PENDIENTE y el monto por cobrar.',
    roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
    sourceId: 'facturas',
    columns: ['numero', 'fecha', 'total', 'metodoPago', 'items'],
    filter: r => r.estado === 'PENDIENTE',
    resumen: rows => [
      { label: 'Pendientes', value: String(rows.length) },
      { label: 'Monto por cobrar', value: money(sumBy(rows, r => r.total)) },
    ],
  },
  {
    id: 'mis_gastos',
    label: 'Mis gastos en farmacia',
    descripcion: 'Tus facturas pagadas y el total gastado.',
    roles: ['PACIENTE'],
    sourceId: 'mis_facturas',
    columns: ['numero', 'fecha', 'total', 'metodoPago', 'items'],
    filter: r => r.estado === 'PAGADA',
    resumen: rows => [
      { label: 'Facturas pagadas', value: String(rows.length) },
      { label: 'Total gastado', value: money(sumBy(rows, r => r.total)) },
    ],
  },
  // ---- Recetas ----
  {
    id: 'recetas_emitidas_res',
    label: 'Resumen de recetas emitidas',
    descripcion: 'Tus recetas emitidas, cuantas son controladas y cuantas estan en blockchain.',
    roles: ['MEDICO'],
    sourceId: 'recetas_emitidas',
    columns: ['fecha', 'paciente', 'estado', 'controlado', 'blockchain'],
    resumen: rows => [
      { label: 'Total emitidas', value: String(rows.length) },
      { label: 'Controladas', value: String(rows.filter(r => r.controlado).length) },
      { label: 'En blockchain', value: String(rows.filter(r => r.blockchainTx).length) },
      ...countBy(rows, r => s(r.estado)),
    ],
  },
  {
    id: 'mis_recetas_res',
    label: 'Mis recetas',
    descripcion: 'Tus recetas con su estado y registro en blockchain.',
    roles: ['PACIENTE'],
    sourceId: 'mis_recetas',
    columns: ['fecha', 'medico', 'diagnostico', 'estado', 'blockchain'],
    resumen: rows => [
      { label: 'Total', value: String(rows.length) },
      ...countBy(rows, r => s(r.estado)),
    ],
  },
  // ---- Inventario / catalogo ----
  {
    id: 'catalogo_activos',
    label: 'Medicamentos activos',
    descripcion: 'Catalogo vigente de medicamentos con precio y categoria.',
    roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'],
    sourceId: 'medicamentos',
    columns: ['nombre', 'categoria', 'precio', 'receta', 'controlado'],
    filter: r => !!r.activo,
    resumen: rows => [
      { label: 'Medicamentos activos', value: String(rows.length) },
      { label: 'Requieren receta', value: String(rows.filter(r => r.requiereReceta).length) },
      { label: 'Controlados', value: String(rows.filter(r => r.controlado).length) },
    ],
  },
  {
    id: 'controlados',
    label: 'Medicamentos controlados',
    descripcion: 'Solo los medicamentos marcados como controlados.',
    roles: ['ADMINISTRADOR', 'FARMACEUTICO', 'MEDICO'],
    sourceId: 'medicamentos',
    columns: ['nombre', 'categoria', 'precio', 'stockMin', 'activo'],
    filter: r => !!r.controlado,
    resumen: rows => [{ label: 'Controlados', value: String(rows.length) }],
  },
  // ---- Administracion / BI ----
  {
    id: 'usuarios_rol',
    label: 'Usuarios por rol',
    descripcion: 'Listado de usuarios del sistema con conteo por rol y estado.',
    roles: ['ADMINISTRADOR'],
    sourceId: 'usuarios',
    columns: ['nombre', 'email', 'rol', 'activo'],
    resumen: rows => [
      { label: 'Total usuarios', value: String(rows.length) },
      { label: 'Activos', value: String(rows.filter(r => r.activo).length) },
      ...countBy(rows, r => s(r.rol)),
    ],
  },
  {
    id: 'ventas_30d',
    label: 'Ventas de los ultimos 30 dias',
    descripcion: 'Serie diaria de ventas (BI) con total del periodo.',
    roles: ['ADMINISTRADOR'],
    sourceId: 'bi_ventas',
    columns: ['dia', 'numFacturas', 'totalVendido', 'ticket'],
    resumen: rows => [
      { label: 'Dias con ventas', value: String(rows.length) },
      { label: 'Facturas', value: String(sumBy(rows, r => r.numFacturas)) },
      { label: 'Total del periodo', value: money(sumBy(rows, r => r.totalVendido)) },
    ],
  },
  {
    id: 'stock_critico',
    label: 'Stock critico',
    descripcion: 'Medicamentos con stock por debajo o cerca del minimo (vista BI).',
    roles: ['ADMINISTRADOR'],
    sourceId: 'bi_stock',
    columns: ['medicamento', 'stockActual', 'stockMinimo', 'nivel'],
    resumen: rows => [
      { label: 'Items en riesgo', value: String(rows.length) },
      ...countBy(rows, r => s(r.nivel)),
    ],
  },
];

export function sourcesForRole(rol: RolUsuario): ReportSource[] {
  return SOURCES.filter(src => src.roles.includes(rol));
}

export function staticReportsForRole(rol: RolUsuario): StaticReport[] {
  return STATIC_REPORTS.filter(r => r.roles.includes(rol));
}

export function sourceById(id: string): ReportSource | undefined {
  return SOURCES.find(x => x.id === id);
}

/** Genera CSV (separado por ; para Excel es-ES) a partir de filas y campos. */
export function toCSV(rows: any[], fields: ReportField[]): string {
  const esc = (v: string) => {
    const t = v.replace(/"/g, '""');
    return /[";\n]/.test(t) ? `"${t}"` : t;
  };
  const head = fields.map(f => esc(f.label)).join(';');
  const body = rows.map(r => fields.map(f => esc(f.get(r))).join(';'));
  return [head, ...body].join('\n');
}
