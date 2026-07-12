// ---------------------------------------------------------------------------
// Reporte con IA por voz.
//
// El movil NO conoce la API key de OpenAI (igual que con el chat de triaje):
// graba el audio con expo-audio, lo sube a MS2 (/api/reporte-ia) junto con el
// catalogo de fuentes que el rol puede consultar, y MS2 es quien:
//   1) transcribe el audio con Whisper (OpenAI),
//   2) le pide a un modelo de OpenAI que elija una fuente + columnas y redacte
//      un analisis en lenguaje natural.
// Devuelve un "plan" que esta pantalla ejecuta contra el gateway GraphQL para
// traer los datos reales (la IA nunca ve datos de pacientes, solo el catalogo
// de columnas y la consulta hablada).
//
// Si OpenAI no esta configurado en MS2, el endpoint degrada con un fallback
// por reglas y la pantalla sigue funcionando.
// ---------------------------------------------------------------------------
import { useState } from 'react';
import { File } from 'expo-file-system';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { env } from '../config/env';

export interface CatalogoFuente {
  id: string;
  label: string;
  campos: { key: string; label: string }[];
}

export interface PlanReporteIA {
  transcripcion: string;
  titulo: string;
  narrativa: string;
  /** id de fuente (sourceId) elegido por la IA, o null si no aplica una tabla. */
  fuente: string | null;
  /** Subconjunto de claves de campo; vacio = todas las de la fuente. */
  columnas: string[];
  proveedor: string;
}

export type EstadoVoz = 'idle' | 'grabando' | 'procesando';

async function postReporte(
  body: FormData,
  token: string | undefined,
): Promise<PlanReporteIA> {
  const resp = await fetch(`${env.diagnosticosUrl}/api/reporte-ia`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      // OJO: no fijar Content-Type, fetch pone el boundary del multipart.
    },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.detail || data?.error || `HTTP ${resp.status}`);
  }
  return {
    transcripcion: String(data.transcripcion ?? ''),
    titulo: String(data.titulo ?? 'Reporte con IA'),
    narrativa: String(data.narrativa ?? ''),
    fuente: data.fuente ? String(data.fuente) : null,
    columnas: Array.isArray(data.columnas) ? data.columnas.map(String) : [],
    proveedor: String(data.proveedor ?? 'desconocido'),
  };
}

export function useReporteVozIA(rol: string, token: string | undefined) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [estado, setEstado] = useState<EstadoVoz>('idle');
  const [error, setError] = useState<string | null>(null);

  async function iniciarGrabacion(): Promise<boolean> {
    setError(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('Necesito permiso de microfono para grabar tu consulta.');
        return false;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setEstado('grabando');
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'No pude iniciar la grabacion.');
      setEstado('idle');
      return false;
    }
  }

  async function detenerYGenerar(
    catalogo: CatalogoFuente[],
  ): Promise<PlanReporteIA | null> {
    setError(null);
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch (e: any) {
      setError(e?.message ?? 'No pude detener la grabacion.');
      setEstado('idle');
      return null;
    }
    if (!uri) {
      setError('No se obtuvo el audio grabado. Intenta de nuevo o escribe tu consulta.');
      setEstado('idle');
      return null;
    }
    setEstado('procesando');
    try {
      const fd = new FormData();
      // SDK 54+: el objeto legacy {uri,name,type} lanza "Unsupported
      // FormDataPart implementation"; File (expo-file-system) implementa Blob.
      fd.append('audio', new File(uri) as any);
      fd.append('rol', rol);
      fd.append('catalogo', JSON.stringify(catalogo));
      return await postReporte(fd, token);
    } catch (e: any) {
      setError(e?.message ?? 'Error procesando el audio.');
      return null;
    } finally {
      setEstado('idle');
    }
  }

  async function generarDesdeTexto(
    consulta: string,
    catalogo: CatalogoFuente[],
  ): Promise<PlanReporteIA | null> {
    setError(null);
    setEstado('procesando');
    try {
      const fd = new FormData();
      fd.append('consulta', consulta);
      fd.append('rol', rol);
      fd.append('catalogo', JSON.stringify(catalogo));
      return await postReporte(fd, token);
    } catch (e: any) {
      setError(e?.message ?? 'Error generando el reporte.');
      return null;
    } finally {
      setEstado('idle');
    }
  }

  function cancelarGrabacion() {
    recorder.stop().catch(() => {});
    setEstado('idle');
  }

  return {
    estado,
    error,
    setError,
    iniciarGrabacion,
    detenerYGenerar,
    generarDesdeTexto,
    cancelarGrabacion,
  };
}
