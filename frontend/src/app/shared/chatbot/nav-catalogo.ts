import { RolUsuario } from '../../core/auth/supabase.service';
import { MENU } from '../layout/menu-items';

/**
 * Catalogo de rutas para el chatbot asistente.
 *
 * Se DERIVA de MENU (menu-items.ts), la misma fuente que pinta el sidebar:
 * labels, iconos, rutas y roles siempre en sincronia sin duplicar nada.
 * Aqui solo se agregan las descripciones que el asistente usa para entender
 * que hay en cada seccion.
 */
export interface NavRuta {
  path: string;
  titulo: string;
  descripcion: string;
  icono: string;
  roles: RolUsuario[];
}

const DESCRIPCIONES: Record<string, string> = {
  '/recepcion':      'Registrar la llegada de pacientes y gestionar la fila de atención.',
  '/caja':           'Cobros, pagos y cierre de caja.',
  '/facturas':       'Emitir y administrar las facturas de la clínica.',
  '/inventario':     'Stock de medicamentos e insumos.',
  '/administracion': 'Usuarios, roles y configuración del sistema.',
  '/dashboard':      'Indicadores y métricas de la clínica (BI).',
  '/mis-recetas':    'Recetas médicas emitidas o recibidas.',
  '/mis-facturas':   'Facturas y pagos del paciente.',
  '/citas':          'Agendar y consultar citas médicas.',
  '/historia':       'Historial médico de los pacientes.',
  '/diagnostico':    'Análisis de imágenes médicas con inteligencia artificial.',
  '/documentos':     'Documentos clínicos: subir, ver y descargar.',
  '/pre-triaje':     'Cuéntale tus síntomas a la IA para orientarte antes de la cita.',
  '/reportes':       'Reportes del sistema, incluyendo reportes por voz con IA.',
};

export const NAV_CATALOGO: NavRuta[] = MENU.map(item => ({
  path: item.route,
  titulo: item.label,
  descripcion: DESCRIPCIONES[item.route] ?? '',
  icono: item.icon,
  roles: item.roles,
}));

export function rutasParaRol(rol: RolUsuario | null | undefined): NavRuta[] {
  if (!rol) return [];
  return NAV_CATALOGO.filter(r => r.roles.includes(rol));
}
