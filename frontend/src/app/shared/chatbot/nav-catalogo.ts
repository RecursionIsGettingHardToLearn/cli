import { RolUsuario } from '../../core/auth/supabase.service';

/**
 * Catalogo de rutas para el chatbot asistente.
 *
 * IMPORTANTE: los paths y roles deben ser un espejo de `app.routes.ts`.
 * Si agregas o cambias una ruta alla, actualiza este catalogo para que el
 * asistente la conozca (y solo se la ofrezca a los roles correctos).
 */
export interface NavRuta {
  path: string;
  titulo: string;
  descripcion: string;
  roles: RolUsuario[];
}

export const NAV_CATALOGO: NavRuta[] = [
  {
    path: '/recepcion',
    titulo: 'Recepción',
    descripcion: 'Registrar la llegada de pacientes y gestionar la fila de atención.',
    roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
  },
  {
    path: '/caja',
    titulo: 'Caja',
    descripcion: 'Cobros, pagos y cierre de caja.',
    roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
  },
  {
    path: '/facturas',
    titulo: 'Facturas',
    descripcion: 'Emitir y administrar las facturas de la clínica.',
    roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
  },
  {
    path: '/inventario',
    titulo: 'Inventario',
    descripcion: 'Stock de medicamentos e insumos.',
    roles: ['ADMINISTRADOR', 'FARMACEUTICO'],
  },
  {
    path: '/administracion',
    titulo: 'Administración',
    descripcion: 'Usuarios, roles y configuración del sistema.',
    roles: ['ADMINISTRADOR'],
  },
  {
    path: '/dashboard',
    titulo: 'Dashboard BI',
    descripcion: 'Indicadores y métricas de la clínica.',
    roles: ['ADMINISTRADOR'],
  },
  {
    path: '/mis-recetas',
    titulo: 'Mis Recetas',
    descripcion: 'Recetas médicas emitidas o recibidas.',
    roles: ['MEDICO', 'PACIENTE'],
  },
  {
    path: '/mis-facturas',
    titulo: 'Mis Facturas',
    descripcion: 'Facturas y pagos del paciente.',
    roles: ['PACIENTE'],
  },
  {
    path: '/citas',
    titulo: 'Citas',
    descripcion: 'Agendar y consultar citas médicas.',
    roles: ['ADMINISTRADOR', 'MEDICO', 'PACIENTE'],
  },
  {
    path: '/historia',
    titulo: 'Historia Clínica',
    descripcion: 'Historial médico de los pacientes.',
    roles: ['ADMINISTRADOR', 'MEDICO'],
  },
  {
    path: '/diagnostico',
    titulo: 'Diagnóstico IA',
    descripcion: 'Análisis de imágenes médicas con inteligencia artificial.',
    roles: ['ADMINISTRADOR', 'MEDICO'],
  },
  {
    path: '/documentos',
    titulo: 'Documentos',
    descripcion: 'Documentos clínicos: subir, ver y descargar.',
    roles: ['ADMINISTRADOR', 'MEDICO', 'PACIENTE'],
  },
  {
    path: '/pre-triaje',
    titulo: 'Pre-triaje',
    descripcion: 'Cuéntale tus síntomas a la IA para orientarte antes de la cita.',
    roles: ['PACIENTE'],
  },
  {
    path: '/reportes',
    titulo: 'Reportes',
    descripcion: 'Reportes del sistema, incluyendo reportes por voz con IA.',
    roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'],
  },
];

export function rutasParaRol(rol: RolUsuario | null | undefined): NavRuta[] {
  if (!rol) return [];
  return NAV_CATALOGO.filter(r => r.roles.includes(rol));
}
