// =====================================================
//  Helper de envío de notificaciones push vía Expo Push API.
//  https://docs.expo.dev/push-notifications/sending-notifications/
//
//  REGLA DURA: el push JAMÁS rompe el flujo principal. Si no hay token, o el
//  formato es inválido, o Expo falla / tarda demasiado, solo se loggea con
//  console.warn y la operación de negocio (cita, diagnóstico, etc.) continúa.
// =====================================================

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TIMEOUT_MS = 5000;

// Acepta ExponentPushToken[...] (formato actual) y ExpoPushToken[...] (alias).
export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

/**
 * Envía una notificación push a un único token de Expo. No lanza nunca: ante
 * cualquier problema retorna en silencio tras un console.warn('[push]', ...).
 *
 * @param token Expo push token del dispositivo (o null/undefined -> no-op).
 */
export async function sendExpoPush(
  token: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (!token || !EXPO_TOKEN_RE.test(token)) return; // sin token válido: no-op silencioso

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({ to: token, title, body, sound: 'default', data }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.warn('[push] Expo respondió', resp.status, txt.slice(0, 300));
      return;
    }
    // Expo responde 200 con { data: { status: 'ok' | 'error', message?, details? } }.
    const json: any = await resp.json().catch(() => null);
    const status = json?.data?.status;
    if (status && status !== 'ok') {
      console.warn('[push] ticket con error:', json?.data?.message ?? JSON.stringify(json?.data));
    }
  } catch (err) {
    // Incluye AbortError (timeout) y fallos de red: nunca propagamos.
    console.warn('[push]', err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timer);
  }
}
