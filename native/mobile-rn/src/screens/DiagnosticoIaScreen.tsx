import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { useAuth } from '../auth/AuthContext';
import { env } from '../config/env';
import {
  Screen,
  Card,
  Field,
  PrimaryButton,
  Loading,
  Banner,
  SectionTitle,
  COLORS,
  fmtFecha,
} from '../ui/kit';
import { type PacienteLite } from '../components/PacienteSearch';
import { PacienteDropdown } from '../components/PacienteDropdown';
import { useMutation } from '@apollo/client';
import { NOTIFICAR_RESULTADO } from '../graphql/queries';

/** Diagnóstico con IA (MEDICO / ADMINISTRADOR).
 *
 * Versión MÓVIL del diagnóstico asistido: usa la cámara del teléfono para
 * fotografiar un estudio (radiografía, lesión dérmica, documento clínico) y
 * la envía a MS2 /api/analizar-imagen, que la analiza con Gemini y persiste
 * el resultado con estado PENDIENTE de revisión médica. El móvil NO conoce
 * la API key del LLM (vive en el .env de MS2). Si Gemini no está disponible,
 * MS2 degrada a su análisis por reglas y la pantalla no nota la diferencia.
 */

interface AnalisisIa {
  resultado_id: number | null;
  proveedor: string;
  tipo_imagen: string;
  hallazgos: string[];
  urgencia: string;
  recomendacion: string;
  confianza: number;
  nota_seguridad: string;
  estado_revision: string;
}

interface ResultadoPrevio {
  id: number;
  tipo: string;
  proveedor: string;
  resultado: Record<string, unknown>;
  estado_revision: string;
  creado_en: string;
}

function colorUrgencia(u: string | undefined): string {
  const v = (u ?? '').toLowerCase();
  if (v.includes('alta') || v.includes('urgente')) return '#b91c1c';
  if (v.includes('media') || v.includes('moderada')) return '#b45309';
  return '#0f6e56';
}

export function DiagnosticoIaScreen() {
  const { session } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);

  const [paciente, setPaciente] = useState<PacienteLite | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [resultado, setResultado] = useState<AnalisisIa | null>(null);
  const [previos, setPrevios] = useState<ResultadoPrevio[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [notificar] = useMutation(NOTIFICAR_RESULTADO);

  async function abrirCamara() {
    setMsg(null);
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        setMsg({ kind: 'error', text: 'Se necesita permiso de cámara para fotografiar el estudio.' });
        return;
      }
    }
    setCamaraAbierta(true);
  }

  async function capturar() {
    try {
      const foto = await camRef.current?.takePictureAsync({ quality: 0.7 });
      if (foto?.uri) setFotoUri(foto.uri);
    } finally {
      setCamaraAbierta(false);
    }
  }

  async function cargarPrevios(p: PacienteLite) {
    // El historial es informativo: si MS2 está dormido (Render free) no
    // bloqueamos la pantalla, simplemente no se muestra.
    try {
      const resp = await fetch(`${env.diagnosticosUrl}/api/resultados/paciente/${p.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (resp.ok) setPrevios(await resp.json());
    } catch {
      /* opcional */
    }
  }

  function onSelect(p: PacienteLite) {
    setPaciente(p);
    setMsg(null);
    setResultado(null);
    cargarPrevios(p);
  }

  async function analizar() {
    if (!fotoUri) {
      setMsg({ kind: 'error', text: 'Primero toma una foto del estudio o la lesión.' });
      return;
    }
    setMsg(null);
    setResultado(null);
    setAnalizando(true);
    try {
      const form = new FormData();
      // SDK 54+: el fetch global (WinterCG) ya no acepta el objeto legacy
      // {uri, name, type} — lanza "Unsupported FormDataPart implementation".
      // La clase File de expo-file-system implementa Blob y sí es soportada.
      form.append('file', new File(fotoUri) as any);
      if (paciente) form.append('paciente_id', paciente.id);
      if (descripcion.trim()) form.append('descripcion', descripcion.trim());

      const resp = await fetch(`${env.diagnosticosUrl}/api/analizar-imagen`, {
        method: 'POST',
        // Sin Content-Type manual: fetch de RN agrega el boundary del multipart.
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail || data?.error || `HTTP ${resp.status}`);
      setResultado(data as AnalisisIa);
      if (paciente) {
        cargarPrevios(paciente);
        // Push al PACIENTE: su resultado ya esta disponible. Es best-effort:
        // si falla la red o el paciente no tiene la app, no rompe el analisis.
        try {
          const r = await notificar({
            variables: {
              pacienteId: paciente.id,
              tipoEstudio: (data as AnalisisIa).tipo_imagen || 'estudio',
            },
          });
          if (r.data?.notificarResultado) {
            setMsg({
              kind: 'ok',
              text: `🔔 Notificación enviada al teléfono de ${paciente.nombre}: su resultado está disponible.`,
            });
          } else {
            setMsg({
              kind: 'warn',
              text: `${paciente.nombre} aún no tiene la app instalada (sin token de notificaciones), así que no se le pudo avisar.`,
            });
          }
        } catch {
          setMsg({ kind: 'warn', text: 'El análisis se guardó, pero no se pudo enviar la notificación al paciente.' });
        }
      }
    } catch (e: any) {
      setMsg({
        kind: 'error',
        text:
          'No se pudo analizar (' +
          (e?.message ?? 'error de red') +
          '). El servicio de IA puede estar despertando; reintenta en unos segundos.',
      });
    } finally {
      setAnalizando(false);
    }
  }

  return (
    <Screen>
      <Card>
        <SectionTitle>Paciente (opcional)</SectionTitle>
        <PacienteDropdown selected={paciente} onSelect={onSelect} onClear={() => setPaciente(null)} />
      </Card>

      <Card>
        <SectionTitle>Estudio a analizar</SectionTitle>

        {camaraAbierta ? (
          <View>
            <CameraView ref={camRef} style={s.camara} facing="back" />
            <View style={s.camBotones}>
              <TouchableOpacity onPress={capturar} style={s.btnCapturar}>
                <Text style={s.btnCapturarText}>📸 Capturar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCamaraAbierta(false)} style={s.btnCancelar}>
                <Text style={s.btnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {fotoUri ? (
              <View>
                <Image source={{ uri: fotoUri }} style={s.preview} resizeMode="cover" />
                <TouchableOpacity onPress={abrirCamara} style={s.btnOtraFoto}>
                  <Text style={s.btnOtraFotoText}>Tomar otra foto</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={abrirCamara} style={s.btnFoto}>
                <Text style={s.btnFotoText}>📷 Fotografiar estudio / lesión</Text>
              </TouchableOpacity>
            )}

            <Field
              label="Contexto clínico (opcional)"
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Ej: radiografía de tórax, paciente con tos persistente"
              multiline
            />

            {msg && <Banner kind={msg.kind} message={msg.text} />}

            <PrimaryButton
              title={analizando ? 'Analizando con IA…' : 'Analizar con IA'}
              onPress={analizar}
              loading={analizando}
            />
          </>
        )}
      </Card>

      {analizando && <Loading />}

      {resultado && (
        <Card>
          <View style={s.resHeader}>
            <SectionTitle>Resultado del análisis</SectionTitle>
            <View style={[s.badge, { backgroundColor: colorUrgencia(resultado.urgencia) }]}>
              <Text style={s.badgeText}>Urgencia {resultado.urgencia}</Text>
            </View>
          </View>

          <Text style={s.tipoImagen}>{resultado.tipo_imagen}</Text>

          {resultado.hallazgos?.map((h, i) => (
            <Text key={i} style={s.hallazgo}>
              • {h}
            </Text>
          ))}

          <Text style={s.recomendacionLabel}>Recomendación</Text>
          <Text style={s.recomendacion}>{resultado.recomendacion}</Text>

          <Text style={s.meta}>
            Confianza: {(resultado.confianza * 100).toFixed(0)}% · Motor: {resultado.proveedor} · Estado:{' '}
            {resultado.estado_revision}
          </Text>
          <Text style={s.notaSeguridad}>{resultado.nota_seguridad}</Text>
        </Card>
      )}

      {paciente && previos.length > 0 && (
        <>
          <SectionTitle>Análisis previos de {paciente.nombre} ({previos.length})</SectionTitle>
          {previos.slice(0, 5).map((r) => (
            <Card key={r.id}>
              <Text style={s.prevFecha}>
                {fmtFecha(r.creado_en)} · {r.tipo} · {r.estado_revision}
              </Text>
              <Text style={s.prevTexto} numberOfLines={2}>
                {String(
                  (r.resultado as any)?.recomendacion ??
                    (r.resultado as any)?.hallazgos?.join('; ') ??
                    r.proveedor,
                )}
              </Text>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  camara: { width: '100%', height: 320, borderRadius: 8, overflow: 'hidden' },
  camBotones: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btnCapturar: {
    flex: 1, backgroundColor: COLORS.primary, padding: 14, borderRadius: 8, alignItems: 'center',
  },
  btnCapturarText: { color: 'white', fontWeight: '700' },
  btnCancelar: {
    padding: 14, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db',
  },
  btnCancelarText: { color: '#374151' },
  btnFoto: {
    borderWidth: 1, borderColor: COLORS.primary, borderStyle: 'dashed', borderRadius: 8,
    padding: 24, alignItems: 'center', marginBottom: 12,
  },
  btnFotoText: { color: COLORS.primary, fontWeight: '600' },
  preview: { width: '100%', height: 220, borderRadius: 8, marginBottom: 8 },
  btnOtraFoto: { alignSelf: 'flex-start', marginBottom: 12 },
  btnOtraFotoText: { color: COLORS.primary, textDecorationLine: 'underline', fontSize: 13 },
  resHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
  tipoImagen: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 6, marginBottom: 8 },
  hallazgo: { fontSize: 13, color: COLORS.text, lineHeight: 20 },
  recomendacionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginTop: 10 },
  recomendacion: { fontSize: 13, color: COLORS.text, lineHeight: 19, marginTop: 2 },
  meta: { fontSize: 11, color: '#6b7280', marginTop: 10 },
  notaSeguridad: { fontSize: 11, color: '#9ca3af', fontStyle: 'italic', marginTop: 6 },
  prevFecha: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  prevTexto: { fontSize: 13, color: COLORS.text },
});
