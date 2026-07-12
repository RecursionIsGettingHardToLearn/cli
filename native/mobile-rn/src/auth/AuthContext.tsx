import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, rolDelJwt, type RolUsuario } from '../config/supabase';
import { registrarPushToken } from '../lib/registerPush';

export interface PerfilUsuario {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
}

interface AuthState {
  session: Session | null;
  user: PerfilUsuario | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Registro silencioso del ExpoPushToken tras iniciar sesion (o al abrir la
      // app ya logueado). Fire-and-forget: no bloquea la UI ni interrumpe el
      // login; los errores se ignoran (Recursos Nativos permite reintentar).
      if (s && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void registrarPushToken().catch(() => {});
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const user: PerfilUsuario | null = session
    ? {
        id: session.user.id,
        email: session.user.email ?? '',
        nombre:
          (session.user.user_metadata?.name as string | undefined) ?? session.user.email ?? 'Usuario',
        rol: rolDelJwt(session.user.app_metadata as Record<string, unknown>),
      }
    : null;

  const value: AuthState = {
    session,
    user,
    loading,
    signIn: async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    signOut: async () => {
      try {
        // scope 'local': borra la sesion guardada en ESTE dispositivo sin
        // requerir red. El signOut por defecto (global) llama al servidor y,
        // si no hay internet o el refresh token ya expiro, falla y deja al
        // usuario "atrapado" con sesion abierta.
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        /* incluso si Supabase falla, abajo forzamos el cierre local */
      } finally {
        // Garantiza volver al Login aunque onAuthStateChange no dispare.
        setSession(null);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
