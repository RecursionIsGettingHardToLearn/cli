import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useAuth } from '../auth/AuthContext';
import { env } from '../config/env';
import {
  Screen, Card, Field, PrimaryButton, Loading, Banner, SectionTitle, COLORS,
} from '../ui/kit';
import { type PacienteLite } from '../components/PacienteSearch';
import { PacienteDropdown } from '../components/PacienteDropdown';
import { useMutation } from '@apollo/client';
import { NOTIFICAR_RESULTADO } from '../graphql/queries';

/** Diagnóstico con IA (MEDICO / ADMINISTRADOR) — versión móvil.
 *
 * Igual que la web: dos análisis INDEPENDIENTES sobre una imagen que el
 * usuario toma con la cámara o ESCOGE de la galería.
 *   - Supervisado: clasificación zero-shot (clase + probabilidades).
 *   - No supervisado: score de anomalía (qué tan atípica es la imagen).
 * Ambos van a MS2 /api/analizar-imagen (OpenAI). La app no conoce la API key.
 */

interface ClaseProb { clase: string; probabilidad: number; }
interface AnalisisIa {
  resultado_id: number | null;
  proveedor: string;
  tipo_imagen: string;
  clasificacion: string;
  probabilidad: number;
  probabilidades: ClaseProb[];
  score_anomalia: number;
  es_anomalo: boolean;
  justificacion_anomalia: string;
  hallazgos: string[];
  urgencia: string;
  recomendacion: string;
  confianza: number;
  nota_seguridad: string;
  estado_revision: string;
}

type Msg = { kind: 'ok' | 'warn' | 'error'; text: string } | null;

function ResultadoSup({ r }: { r: AnalisisIa }) {
  return (
    <View style={s.resBox}>
      <Text style={s.resLabel}>CLASE PREDICHA (zero-shot)</Text>
      <View style={s.predRow}>
        <Text style={s.predClase}>{r.clasificacion}</Text>
        <Text style={s.predProb}>{((r.probabilidad ?? 0) * 100).toFixed(0)}%</Text>
      </View>
      {(r.probabilidades ?? []).map((c, i) => (
        <View key={i} style={s.barRow}>
          <Text style={s.barNom} numberOfLines={1}>{c.clase}</Text>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${Math.round((c.probabilidad ?? 0) * 100)}%`, backgroundColor: i === 0 ? COLORS.primary : '#9ca3af' }]} />
          </View>
          <Text style={s.barPct}>{((c.probabilidad ?? 0) * 100).toFixed(0)}%</Text>
        </View>
      ))}
      {(r.hallazgos ?? []).map((h, i) => (
        <Text key={i} style={s.hallazgo}>• {h}</Text>
      ))}
      {!!r.recomendacion && <Text style={s.reco}>{r.recomendacion}</Text>}
      <Text style={s.meta}>vía {r.proveedor} · Urgencia {r.urgencia}</Text>
    </View>
  );
}

function ResultadoNs({ r }: { r: AnalisisIa }) {
  const atip = !!r.es_anomalo;
  return (
    <View style={[s.resBox, { backgroundColor: atip ? '#fef2f2' : '#f0fdf4', borderColor: atip ? '#fecaca' : '#bbf7d0' }]}>
      <View style={s.predRow}>
        <Text style={s.resLabel}>SCORE DE RAREZA</Text>
        <View style={[s.verdict, { backgroundColor: atip ? '#fee2e2' : '#dcfce7' }]}>
          <Text style={[s.verdictText, { color: atip ? '#991b1b' : '#166534' }]}>{atip ? 'ATÍPICO' : 'NORMAL'}</Text>
        </View>
      </View>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${Math.round((r.score_anomalia ?? 0) * 100)}%`, backgroundColor: atip ? '#dc2626' : '#16a34a' }]} />
      </View>
      <Text style={s.meta}>Score: {((r.score_anomalia ?? 0) * 100).toFixed(0)}%{r.justificacion_anomalia ? ` · ${r.justificacion_anomalia}` : ''}</Text>
      <Text style={s.meta}>vía {r.proveedor}</Text>
    </View>
  );
}

export function DiagnosticoIaScreen() {
  const { session } = useAuth();
  const [paciente, setPaciente] = useState<PacienteLite | null>(null);

  // --- Supervisado (independiente) ---
  const [supUri, setSupUri] = useState<string | null>(null);
  const [supCtx, setSupCtx] = useState('');
  const [supLoad, setSupLoad] = useState(false);
  const [supRes, setSupRes] = useState<AnalisisIa | null>(null);

  // --- No supervisado (independiente) ---
  const [nsUri, setNsUri] = useState<string | null>(null);
  const [nsCtx, setNsCtx] = useState('');
  const [nsLoad, setNsLoad] = useState(false);
  const [nsRes, setNsRes] = useState<AnalisisIa | null>(null);

  const [msg, setMsg] = useState<Msg>(null);
  const [notificando, setNotificando] = useState(false);
  const [notificar] = useMutation(NOTIFICAR_RESULTADO);

  async function pickCamera(setUri: (u: string) => void) {
    setMsg(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setMsg({ kind: 'error', text: 'Se necesita permiso de cámara.' }); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets?.[0]?.uri) setUri(r.assets[0].uri);
  }

  async function pickGallery(setUri: (u: string) => void) {
    setMsg(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setMsg({ kind: 'error', text: 'Se necesita permiso para acceder a los archivos.' }); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!r.canceled && r.assets?.[0]?.uri) setUri(r.assets[0].uri);
  }

  async function analizar(uri: string, contexto: string): Promise<AnalisisIa> {
    const form = new FormData();
    // La clase File de expo-file-system implementa Blob (soportado por el
    // fetch de RN en SDK 54+). El objeto legacy {uri,name,type} ya no sirve.
    form.append('file', new File(uri) as any);
    if (contexto.trim()) form.append('descripcion', contexto.trim());
    const resp = await fetch(`${env.diagnosticosUrl}/api/analizar-imagen`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: form,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.detail || data?.error || `HTTP ${resp.status}`);
    return data as AnalisisIa;
  }

  async function analizarSup() {
    if (!supUri) { setMsg({ kind: 'error', text: 'Elige o toma una imagen para clasificar.' }); return; }
    setMsg(null); setSupRes(null); setSupLoad(true);
    try { setSupRes(await analizar(supUri, supCtx)); }
    catch (e: any) { setMsg({ kind: 'error', text: 'No se pudo clasificar (' + (e?.message ?? 'error de red') + '). Reintenta en unos segundos.' }); }
    finally { setSupLoad(false); }
  }

  async function analizarNs() {
    if (!nsUri) { setMsg({ kind: 'error', text: 'Elige o toma una imagen para analizar.' }); return; }
    setMsg(null); setNsRes(null); setNsLoad(true);
    try { setNsRes(await analizar(nsUri, nsCtx)); }
    catch (e: any) { setMsg({ kind: 'error', text: 'No se pudo analizar (' + (e?.message ?? 'error de red') + '). Reintenta en unos segundos.' }); }
    finally { setNsLoad(false); }
  }

  async function enviarNotif() {
    if (!paciente) { setMsg({ kind: 'error', text: 'Elige un paciente para notificar.' }); return; }
    setNotificando(true);
    try {
      const tipo = supRes?.tipo_imagen || nsRes?.tipo_imagen || 'estudio';
      const r = await notificar({ variables: { pacienteId: paciente.id, tipoEstudio: tipo } });
      setMsg(r.data?.notificarResultado
        ? { kind: 'ok', text: `🔔 Notificación enviada a ${paciente.nombre}: su resultado está disponible.` }
        : { kind: 'warn', text: `${paciente.nombre} aún no tiene la app con notificaciones activadas (sin token).` });
    } catch {
      setMsg({ kind: 'warn', text: 'No se pudo enviar la notificación al paciente.' });
    } finally {
      setNotificando(false);
    }
  }

  const renderPicker = (uri: string | null, setUri: (u: string) => void) => (
    uri ? (
      <View>
        <Image source={{ uri }} style={s.preview} resizeMode="cover" />
        <View style={s.pickRow}>
          <TouchableOpacity onPress={() => pickCamera(setUri)} style={s.pickBtnSm}><Text style={s.pickBtnSmText}>📷 Otra foto</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => pickGallery(setUri)} style={s.pickBtnSm}><Text style={s.pickBtnSmText}>🖼️ Escoger otro</Text></TouchableOpacity>
        </View>
      </View>
    ) : (
      <View style={s.pickRow}>
        <TouchableOpacity onPress={() => pickCamera(setUri)} style={s.pickBtn}><Text style={s.pickBtnText}>📷 Cámara</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => pickGallery(setUri)} style={s.pickBtn}><Text style={s.pickBtnText}>🖼️ Escoger archivo</Text></TouchableOpacity>
      </View>
    )
  );

  return (
    <Screen>
      {/* ===== SUPERVISADO ===== */}
      <Card>
        <View style={s.tituloRow}>
          <View style={s.tagSup}><Text style={s.tagText}>SUPERVISADO</Text></View>
          <SectionTitle>Clasificación</SectionTitle>
        </View>
        {renderPicker(supUri, setSupUri)}
        <Field label="Contexto clínico (opcional)" value={supCtx} onChangeText={setSupCtx}
          placeholder="Ej: radiografía de tórax" multiline />
        <PrimaryButton title={supLoad ? 'Clasificando…' : 'Clasificar con IA'} onPress={analizarSup} loading={supLoad} />
        {supLoad && <Loading />}
        {supRes && <ResultadoSup r={supRes} />}
      </Card>

      {/* ===== NO SUPERVISADO ===== */}
      <Card>
        <View style={s.tituloRow}>
          <View style={s.tagNs}><Text style={s.tagText}>NO SUPERVISADO</Text></View>
          <SectionTitle>Detección de anomalías</SectionTitle>
        </View>
        {renderPicker(nsUri, setNsUri)}
        <Field label="Contexto clínico (opcional)" value={nsCtx} onChangeText={setNsCtx}
          placeholder="Ej: lesión en la piel" multiline />
        <PrimaryButton title={nsLoad ? 'Analizando…' : 'Detectar anomalías con IA'} onPress={analizarNs} loading={nsLoad} />
        {nsLoad && <Loading />}
        {nsRes && <ResultadoNs r={nsRes} />}
      </Card>

      {msg && <Banner kind={msg.kind} message={msg.text} />}

      {/* ===== NOTIFICAR ===== */}
      {(supRes || nsRes) && (
        <Card>
          <SectionTitle>Notificar al paciente</SectionTitle>
          <PacienteDropdown selected={paciente} onSelect={setPaciente} onClear={() => setPaciente(null)} />
          <PrimaryButton title={notificando ? 'Enviando…' : '🔔 Enviar notificación'} onPress={enviarNotif} loading={notificando} />
        </Card>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  tituloRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tagSup: { backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  tagNs: { backgroundColor: '#7c3aed', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  tagText: { color: 'white', fontSize: 10, fontWeight: '700' },
  pickRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  pickBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.primary, borderStyle: 'dashed', borderRadius: 8,
    padding: 18, alignItems: 'center',
  },
  pickBtnText: { color: COLORS.primary, fontWeight: '600' },
  pickBtnSm: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, alignItems: 'center',
  },
  pickBtnSmText: { color: '#374151', fontSize: 13 },
  preview: { width: '100%', height: 200, borderRadius: 8, marginBottom: 8 },
  resBox: {
    marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: '#f8fafc',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  resLabel: { fontSize: 10, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5 },
  predRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  predClase: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  predProb: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 },
  barNom: { width: 110, fontSize: 12, color: '#374151' },
  barTrack: { flex: 1, height: 10, backgroundColor: '#e5e7eb', borderRadius: 999, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 999 },
  barPct: { width: 40, textAlign: 'right', fontSize: 12, color: '#374151' },
  verdict: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  verdictText: { fontSize: 11, fontWeight: '700' },
  hallazgo: { fontSize: 13, color: COLORS.text, lineHeight: 20, marginTop: 4 },
  reco: { fontSize: 13, color: COLORS.text, lineHeight: 19, marginTop: 8 },
  meta: { fontSize: 11, color: '#6b7280', marginTop: 8 },
});
