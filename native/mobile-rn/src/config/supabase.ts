import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Cliente Supabase para React Native.
 * - AsyncStorage para persistir la sesion en disco del dispositivo
 * - processLock para evitar NavigatorLockAcquireTimeoutError
 * - detectSessionInUrl=false porque no aplica en RN
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

export type RolUsuario = 'ADMINISTRADOR' | 'MEDICO' | 'FARMACEUTICO' | 'PACIENTE';

export function rolDelJwt(appMetadata: Record<string, unknown> | undefined): RolUsuario {
  const role = appMetadata?.role;
  if (typeof role === 'string' && ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'].includes(role)) {
    return role as RolUsuario;
  }
  return 'PACIENTE';
}
