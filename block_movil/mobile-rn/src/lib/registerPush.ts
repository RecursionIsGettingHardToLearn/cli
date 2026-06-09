import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apolloClient } from '../config/apollo';
import { REGISTRAR_PUSH_TOKEN } from '../graphql/queries';
import { supabase } from '../config/supabase';

/**
 * Obtención + registro del ExpoPushToken del dispositivo en MS1.
 *
 * NOTA (Expo SDK 56): getExpoPushTokenAsync() EXIGE un projectId de EAS y los
 * push remotos NO funcionan en Expo Go (SDK 53+): hace falta un development
 * build (`npx expo run:android` / `eas build --profile development`). El código
 * queda correcto; solo necesita que `expo.extra.eas.projectId` esté poblado en
 * app.json (corre `eas init` para generarlo).
 */
export type PushRegResult = { ok: boolean; token?: string; error?: string };

function getProjectId(): string | undefined {
  const pid =
    (Constants.expoConfig?.extra as any)?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId;
  // Ignora placeholders del repo ("<...>") y vacíos, igual que config/env.ts.
  if (!pid || typeof pid !== 'string') return undefined;
  const v = pid.trim();
  return v && !v.startsWith('<') ? v : undefined;
}

/**
 * Pide permiso (si hace falta), obtiene el token y lo registra en MS1.
 * Idempotente y seguro de llamar varias veces (el backend hace upsert).
 * NUNCA lanza: devuelve { ok, token?, error? }.
 */
export async function registrarPushToken(): Promise<PushRegResult> {
  try {
    if (!Device.isDevice) {
      return { ok: false, error: 'Las notificaciones push requieren un dispositivo físico.' };
    }

    // Android necesita un canal para mostrar notificaciones.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // Permisos
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return { ok: false, error: 'Permiso de notificaciones denegado.' };
    }

    // Token de Expo (requiere projectId en SDK 56)
    let token: string;
    try {
      const projectId = getProjectId();
      const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      token = t.data;
    } catch (e: any) {
      return {
        ok: false,
        error:
          (e?.message ?? 'No se pudo obtener el ExpoPushToken.') +
          ' (¿falta expo.extra.eas.projectId en app.json? Corre `eas init`).',
      };
    }

    // Solo registramos en backend si hay sesión: Apollo adjunta el JWT de
    // Supabase y el resolver lo necesita para resolver el usuario.
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      return { ok: false, token, error: 'Token obtenido, pero no hay sesión activa para registrarlo.' };
    }

    try {
      const res = await apolloClient.mutate({
        mutation: REGISTRAR_PUSH_TOKEN,
        variables: { token },
      });
      if (res.errors?.length) {
        return { ok: false, token, error: res.errors[0].message };
      }
      return { ok: true, token };
    } catch (e: any) {
      return { ok: false, token, error: e?.message ?? 'Error registrando el token en MS1.' };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Error inesperado al registrar push.' };
  }
}
