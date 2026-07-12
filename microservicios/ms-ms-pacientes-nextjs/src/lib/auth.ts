import { createRemoteJWKSet, jwtVerify } from 'jose';

export type Rol = 'ADMINISTRADOR' | 'MEDICO' | 'FARMACEUTICO' | 'PACIENTE';

export interface Actor {
  uid: string; // supabase_uid (claim sub)
  email?: string;
  nombre?: string;
  rol: Rol;
}

const jwksUri = process.env.SUPABASE_JWKS_URI;
const issuer = process.env.SUPABASE_ISSUER;

// JWKS remoto de Supabase (cachea las claves). Soporta ES256 (default) y RS256.
const JWKS = jwksUri ? createRemoteJWKSet(new URL(jwksUri)) : null;

/**
 * Verifica el Bearer JWT de Supabase y devuelve el actor, o null si no hay/!valido.
 * El frontend oculta por rol (UX); cada resolver del backend bloquea de verdad.
 */
export async function actorFromRequest(req: Request): Promise<Actor | null> {
  const authz = req.headers.get('authorization');
  if (!authz || !authz.toLowerCase().startsWith('bearer ')) return null;
  const token = authz.slice(7).trim();
  if (!JWKS) return null; // sin JWKS configurado no se valida (modo dev)

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ['ES256', 'RS256'],
      ...(issuer ? { issuer } : {}),
    });
    const appMeta = (payload as Record<string, any>).app_metadata ?? {};
    const userMeta = (payload as Record<string, any>).user_metadata ?? {};
    return {
      uid: String(payload.sub),
      email: (payload as Record<string, any>).email,
      nombre: userMeta.name,
      rol: normalizeRol(appMeta.role ?? userMeta.role),
    };
  } catch (err) {
    // Token presente pero invalido (firma/expiracion/issuer): logueamos el
    // error COMPLETO para depuracion en vez de tragarlo silenciosamente.
    console.error('[ms-pacientes][auth] verificacion de JWT fallo:', err);
    return null;
  }
}

function normalizeRol(r: unknown): Rol {
  const s = String(r ?? '').toUpperCase();
  if (s === 'ADMINISTRADOR' || s === 'MEDICO' || s === 'FARMACEUTICO' || s === 'PACIENTE') return s;
  return 'PACIENTE';
}
