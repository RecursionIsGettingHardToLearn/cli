import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useApolloClient } from '@apollo/client';
import { useAuth } from '../auth/AuthContext';
import {
  Screen,
  Card,
  SectionTitle,
  ChipSelect,
  Field,
  PrimaryButton,
  OutlineButton,
  Badge,
  Banner,
  COLORS,
} from '../ui/kit';
import {
  sourcesForRole,
  staticReportsForRole,
  sourceById,
  type ReportSource,
  type ReportField,
  type ResumenItem,
  type StaticReport,
  type ReportCtx,
} from '../reports/sources';
import { exportarPDF, exportarCSV } from '../reports/export';
import { useReporteVozIA, type CatalogoFuente, type PlanReporteIA } from '../reports/voiceReport';

const MAX_VISIBLE = 150; // filas mostradas en pantalla (el export lleva todas)

// ===========================================================================
// Helpers de datos
// ===========================================================================
async function runSource(client: any, src: ReportSource, ctx: ReportCtx): Promise<any[]> {
  const res = await client.query({
    query: src.query,
    variables: src.variables ? src.variables(ctx) : {},
    fetchPolicy: 'network-only',
  });
  let rows: any[] = src.extract(res.data) ?? [];
  if (src.postFilter) rows = src.postFilter(rows, ctx);
  return rows;
}

function fieldsByKeys(src: ReportSource, keys: string[]): ReportField[] {
  return keys
    .map(k => src.fields.find(f => f.key === k))
    .filter((f): f is ReportField => !!f);
}

// ===========================================================================
// Tabla con scroll horizontal (sin dependencias)
// ===========================================================================
function DataTable({ fields, rows }: { fields: ReportField[]; rows: any[] }) {
  if (!fields.length) {
    return <Text style={st.muted}>Selecciona al menos una columna.</Text>;
  }
  const visibles = rows.slice(0, MAX_VISIBLE);
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={[st.tr, st.trHead]}>
            {fields.map(f => (
              <Text key={f.key} style={[st.th, { width: f.width ?? 120 }]} numberOfLines={1}>
                {f.label}
              </Text>
            ))}
          </View>
          {visibles.map((r, i) => (
            <View key={i} style={[st.tr, i % 2 ? st.trOdd : null]}>
              {fields.map(f => (
                <Text key={f.key} style={[st.td, { width: f.width ?? 120 }]}>
                  {f.get(r)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={st.count}>
        {rows.length > MAX_VISIBLE
          ? `Mostrando ${MAX_VISIBLE} de ${rows.length} registros (el archivo exportado los incluye todos)`
          : `${rows.length} registro(s)`}
      </Text>
    </View>
  );
}

function ResumenChips({ items }: { items: ResumenItem[] }) {
  if (!items.length) return null;
  return (
    <View style={st.resumen}>
      {items.map((it, i) => (
        <View key={i} style={st.resChip}>
          <Text style={st.resLabel} numberOfLines={2}>
            {it.label}
          </Text>
          <Text style={st.resValue}>{it.value}</Text>
        </View>
      ))}
    </View>
  );
}

function ExportBar({
  onPdf,
  onCsv,
  busy,
  disabled,
}: {
  onPdf: () => void;
  onCsv: () => void;
  busy: 'pdf' | 'csv' | null;
  disabled?: boolean;
}) {
  return (
    <View style={st.exportRow}>
      <View style={st.exportBtn}>
        {busy === 'pdf' ? (
          <View style={st.busyBox}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <OutlineButton title="Exportar PDF" onPress={onPdf} disabled={disabled || !!busy} />
        )}
      </View>
      <View style={st.exportBtn}>
        {busy === 'csv' ? (
          <View style={st.busyBox}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <OutlineButton title="Exportar CSV" onPress={onCsv} disabled={disabled || !!busy} />
        )}
      </View>
    </View>
  );
}

// ===========================================================================
// 1) REPORTES ESTATICOS
// ===========================================================================
function TabEstaticos({ ctx, usuario }: { ctx: ReportCtx; usuario: string }) {
  const client = useApolloClient();
  const reportes = useMemo(() => staticReportsForRole(ctx.rol), [ctx.rol]);
  const [sel, setSel] = useState<StaticReport | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);

  const src = sel ? sourceById(sel.sourceId) : undefined;
  const fields = useMemo(
    () => (sel && src ? fieldsByKeys(src, sel.columns) : []),
    [sel, src],
  );
  const filtradas = useMemo(
    () => (sel?.filter ? rows.filter(r => sel.filter!(r, ctx)) : rows),
    [rows, sel, ctx],
  );
  const resumen = useMemo(
    () => (sel?.resumen ? sel.resumen(filtradas) : []),
    [sel, filtradas],
  );

  async function abrir(r: StaticReport) {
    const fuente = sourceById(r.sourceId);
    if (!fuente) return;
    setSel(r);
    setErr(null);
    setLoading(true);
    setRows([]);
    try {
      setRows(await runSource(client, fuente, ctx));
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  }

  async function pdf() {
    if (!sel) return;
    setBusy('pdf');
    try {
      await exportarPDF({
        titulo: sel.label,
        subtitulo: sel.descripcion,
        resumen,
        fields,
        rows: filtradas,
        meta: { rol: ctx.rol, usuario },
      });
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo exportar el PDF.');
    } finally {
      setBusy(null);
    }
  }

  async function csv() {
    if (!sel) return;
    setBusy('csv');
    try {
      await exportarCSV(sel.label, filtradas, fields);
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo exportar el CSV.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View>
      <Text style={st.help}>
        Reportes ya definidos para tu rol. Tocalos para generarlos y exportarlos.
      </Text>

      {reportes.map(r => {
        const activo = sel?.id === r.id;
        return (
          <TouchableOpacity key={r.id} activeOpacity={0.85} onPress={() => abrir(r)}>
            <Card style={activo ? st.cardActive : undefined}>
              <Text style={st.repTitle}>{r.label}</Text>
              <Text style={st.repDesc}>{r.descripcion}</Text>
            </Card>
          </TouchableOpacity>
        );
      })}

      {sel && (
        <Card>
          <Text style={st.resultTitle}>{sel.label}</Text>
          {loading && (
            <View style={st.loadingBox}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={st.muted}>Generando...</Text>
            </View>
          )}
          {err && !loading && <Banner kind="error" message={err} />}
          {!loading && !err && (
            <>
              <ResumenChips items={resumen} />
              <DataTable fields={fields} rows={filtradas} />
              <ExportBar onPdf={pdf} onCsv={csv} busy={busy} disabled={!filtradas.length} />
            </>
          )}
        </Card>
      )}
    </View>
  );
}

// ===========================================================================
// 2) REPORTES DINAMICOS (elegir tabla + columnas)
// ===========================================================================
function TabDinamicos({ ctx, usuario }: { ctx: ReportCtx; usuario: string }) {
  const client = useApolloClient();
  const fuentes = useMemo(() => sourcesForRole(ctx.rol), [ctx.rol]);
  const [src, setSrc] = useState<ReportSource | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [ran, setRan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);

  function elegirFuente(f: ReportSource) {
    setSrc(f);
    setKeys(f.fields.map(x => x.key)); // por defecto todas
    setRows([]);
    setRan(false);
    setErr(null);
  }

  function toggle(k: string) {
    setKeys(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
  }

  const fields = useMemo(
    () => (src ? src.fields.filter(f => keys.includes(f.key)) : []),
    [src, keys],
  );

  async function generar() {
    if (!src) return;
    setErr(null);
    setLoading(true);
    setRan(true);
    setRows([]);
    try {
      setRows(await runSource(client, src, ctx));
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  }

  const titulo = src ? `Reporte dinamico — ${src.label}` : 'Reporte dinamico';

  async function pdf() {
    setBusy('pdf');
    try {
      await exportarPDF({
        titulo,
        subtitulo: `${fields.length} columna(s) seleccionada(s)`,
        fields,
        rows,
        meta: { rol: ctx.rol, usuario },
      });
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo exportar el PDF.');
    } finally {
      setBusy(null);
    }
  }

  async function csv() {
    setBusy('csv');
    try {
      await exportarCSV(titulo, rows, fields);
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo exportar el CSV.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View>
      <Text style={st.help}>
        Arma tu propio reporte: elige una tabla y marca las columnas que quieras incluir.
      </Text>

      <Card>
        <Text style={st.label}>Tabla / fuente de datos</Text>
        <ChipSelect
          options={fuentes.map(f => f.id)}
          value={src?.id ?? null}
          onChange={id => {
            const f = fuentes.find(x => x.id === id);
            if (f) elegirFuente(f);
          }}
          labelOf={id => fuentes.find(x => x.id === id)?.label ?? id}
        />
      </Card>

      {src && (
        <Card>
          <Text style={st.label}>Columnas ({keys.length}/{src.fields.length})</Text>
          <View style={st.colWrap}>
            {src.fields.map(f => {
              const on = keys.includes(f.key);
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[st.colItem, on && st.colItemOn]}
                  onPress={() => toggle(f.key)}
                  activeOpacity={0.8}
                >
                  <View style={[st.box, on && st.boxOn]}>
                    {on && <Text style={st.boxTick}>✓</Text>}
                  </View>
                  <Text style={[st.colText, on && st.colTextOn]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={st.miniRow}>
            <TouchableOpacity onPress={() => setKeys(src.fields.map(f => f.key))}>
              <Text style={st.link}>Todas</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setKeys([])}>
              <Text style={st.link}>Ninguna</Text>
            </TouchableOpacity>
          </View>
          <PrimaryButton
            title="Generar reporte"
            onPress={generar}
            loading={loading}
            disabled={!keys.length}
          />
        </Card>
      )}

      {ran && (
        <Card>
          <Text style={st.resultTitle}>{titulo}</Text>
          {loading && (
            <View style={st.loadingBox}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={st.muted}>Generando...</Text>
            </View>
          )}
          {err && !loading && <Banner kind="error" message={err} />}
          {!loading && !err && (
            <>
              <DataTable fields={fields} rows={rows} />
              <ExportBar onPdf={pdf} onCsv={csv} busy={busy} disabled={!rows.length || !fields.length} />
            </>
          )}
        </Card>
      )}
    </View>
  );
}

// ===========================================================================
// 3) REPORTE CON IA (OpenAI) POR VOZ
// ===========================================================================
function TabIA({ ctx, usuario, token }: { ctx: ReportCtx; usuario: string; token?: string }) {
  const client = useApolloClient();
  const voz = useReporteVozIA(ctx.rol, token);
  const [texto, setTexto] = useState('');
  const [plan, setPlan] = useState<PlanReporteIA | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [fields, setFields] = useState<ReportField[]>([]);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const [errDatos, setErrDatos] = useState<string | null>(null);

  const catalogo: CatalogoFuente[] = useMemo(
    () =>
      sourcesForRole(ctx.rol).map(s => ({
        id: s.id,
        label: s.label,
        campos: s.fields.map(f => ({ key: f.key, label: f.label })),
      })),
    [ctx.rol],
  );

  async function aplicarPlan(p: PlanReporteIA | null) {
    if (!p) return;
    setPlan(p);
    setRows([]);
    setFields([]);
    setErrDatos(null);
    // Solo ejecutamos la fuente si la IA eligio una permitida para el rol.
    const src = p.fuente ? sourcesForRole(ctx.rol).find(s => s.id === p.fuente) : undefined;
    if (!src) return;
    const cols = p.columnas?.length ? fieldsByKeys(src, p.columnas) : src.fields;
    setFields(cols.length ? cols : src.fields);
    setCargandoDatos(true);
    try {
      setRows(await runSource(client, src, ctx));
    } catch (e: any) {
      setErrDatos(e?.message ?? 'No se pudieron traer los datos del reporte.');
    } finally {
      setCargandoDatos(false);
    }
  }

  async function onMic() {
    if (voz.estado === 'grabando') {
      const p = await voz.detenerYGenerar(catalogo);
      await aplicarPlan(p);
    } else {
      await voz.iniciarGrabacion();
    }
  }

  async function onTexto() {
    if (!texto.trim()) return;
    const p = await voz.generarDesdeTexto(texto.trim(), catalogo);
    await aplicarPlan(p);
  }

  async function pdf() {
    if (!plan) return;
    setBusy('pdf');
    try {
      await exportarPDF({
        titulo: plan.titulo || 'Reporte con IA',
        subtitulo: plan.transcripcion ? `Consulta: "${plan.transcripcion}"` : undefined,
        narrativa: plan.narrativa,
        fields,
        rows,
        meta: { rol: ctx.rol, usuario },
      });
    } catch (e: any) {
      setErrDatos(e?.message ?? 'No se pudo exportar el PDF.');
    } finally {
      setBusy(null);
    }
  }

  async function csv() {
    if (!plan || !fields.length) return;
    setBusy('csv');
    try {
      await exportarCSV(plan.titulo || 'reporte_ia', rows, fields);
    } catch (e: any) {
      setErrDatos(e?.message ?? 'No se pudo exportar el CSV.');
    } finally {
      setBusy(null);
    }
  }

  const procesando = voz.estado === 'procesando' || cargandoDatos;
  const grabando = voz.estado === 'grabando';

  return (
    <View>
      <Text style={st.help}>
        Pide un reporte hablando: por ejemplo “dame las ventas de la ultima semana por metodo
        de pago” o “cuantas citas tengo agendadas”. La IA elige los datos y redacta un analisis.
      </Text>

      <Card>
        <TouchableOpacity
          style={[st.mic, grabando && st.micRec]}
          onPress={onMic}
          disabled={procesando}
          activeOpacity={0.85}
        >
          {procesando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={st.micText}>{grabando ? '⏹  Detener y generar' : '🎤  Grabar consulta'}</Text>
          )}
        </TouchableOpacity>
        {grabando && <Text style={st.recHint}>Grabando... habla tu consulta y toca “Detener”.</Text>}

        <Text style={[st.label, { marginTop: 12 }]}>...o escribela</Text>
        <Field
          value={texto}
          onChangeText={setTexto}
          placeholder="Escribe tu consulta para el reporte"
          multiline
          editable={!procesando}
        />
        <PrimaryButton
          title="Generar desde texto"
          onPress={onTexto}
          loading={voz.estado === 'procesando'}
          disabled={!texto.trim() || grabando}
        />

        {voz.error && (
          <View style={{ marginTop: 10 }}>
            <Banner kind="warn" message={voz.error} />
          </View>
        )}
      </Card>

      {plan && (
        <Card>
          <View style={st.iaHead}>
            <Text style={st.resultTitle}>{plan.titulo}</Text>
            <Badge
              text={plan.proveedor === 'openai' ? 'OpenAI' : 'IA (fallback)'}
              bg={plan.proveedor === 'openai' ? COLORS.okBg : COLORS.warnBg}
              color={plan.proveedor === 'openai' ? COLORS.ok : COLORS.warn}
            />
          </View>

          {!!plan.transcripcion && (
            <Text style={st.transcripcion}>“{plan.transcripcion}”</Text>
          )}

          {!!plan.narrativa && (
            <View style={st.narr}>
              <Text style={st.narrText}>{plan.narrativa}</Text>
            </View>
          )}

          {cargandoDatos && (
            <View style={st.loadingBox}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={st.muted}>Trayendo datos...</Text>
            </View>
          )}
          {errDatos && !cargandoDatos && <Banner kind="error" message={errDatos} />}

          {!cargandoDatos && fields.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <DataTable fields={fields} rows={rows} />
            </View>
          )}

          <ExportBar onPdf={pdf} onCsv={csv} busy={busy} disabled={!fields.length && !plan.narrativa} />
          {!fields.length && (
            <Text style={st.muted}>
              Este reporte es solo narrativo (sin tabla); puedes exportarlo a PDF.
            </Text>
          )}
        </Card>
      )}
    </View>
  );
}

// ===========================================================================
// PANTALLA PRINCIPAL
// ===========================================================================
type Tab = 'estaticos' | 'dinamicos' | 'ia';
const TAB_LABEL: Record<Tab, string> = {
  estaticos: 'Estaticos',
  dinamicos: 'Dinamicos',
  ia: 'IA por voz',
};

export function ReportesScreen() {
  const { user, session } = useAuth();
  const rol = user?.rol ?? 'PACIENTE';
  const ctx: ReportCtx = { uid: user?.id ?? '', rol };
  const usuario = user?.nombre ?? user?.email ?? '';
  const token = session?.access_token;
  const [tab, setTab] = useState<Tab>('estaticos');

  return (
    <Screen>
      <SectionTitle>Reportes</SectionTitle>
      <View style={{ marginBottom: 8 }}>
        <ChipSelect
          options={['estaticos', 'dinamicos', 'ia'] as Tab[]}
          value={tab}
          onChange={setTab}
          labelOf={t => TAB_LABEL[t as Tab]}
        />
      </View>

      {tab === 'estaticos' && <TabEstaticos ctx={ctx} usuario={usuario} />}
      {tab === 'dinamicos' && <TabDinamicos ctx={ctx} usuario={usuario} />}
      {tab === 'ia' && <TabIA ctx={ctx} usuario={usuario} token={token} />}
    </Screen>
  );
}

// ===========================================================================
// Estilos
// ===========================================================================
const st = StyleSheet.create({
  help: { color: COLORS.textMuted, fontSize: 13, marginBottom: 10, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  link: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  muted: { color: COLORS.textMuted, fontSize: 13, marginTop: 6 },

  cardActive: { borderColor: COLORS.primary, borderWidth: 2 },
  repTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  repDesc: { fontSize: 13, color: COLORS.textMuted, marginTop: 3, lineHeight: 18 },
  resultTitle: { fontSize: 16, fontWeight: '800', color: COLORS.primaryDark, marginBottom: 8 },

  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },

  // resumen
  resumen: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  resChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 110,
    backgroundColor: '#fbfdfc',
  },
  resLabel: { color: COLORS.textMuted, fontSize: 11 },
  resValue: { color: COLORS.primaryDark, fontSize: 16, fontWeight: '800', marginTop: 2 },

  // tabla
  tr: { flexDirection: 'row' },
  trHead: { backgroundColor: COLORS.primary, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  trOdd: { backgroundColor: '#f8fafc' },
  th: { color: '#fff', fontWeight: '700', fontSize: 11, paddingVertical: 8, paddingHorizontal: 8 },
  td: {
    color: COLORS.text,
    fontSize: 11.5,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f1',
  },
  count: { color: COLORS.textMuted, fontSize: 11, marginTop: 6, textAlign: 'right' },

  // export
  exportRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  exportBtn: { flex: 1 },
  busyBox: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },

  // columnas (dinamico)
  colWrap: { gap: 6, marginBottom: 8 },
  colItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  colItemOn: { borderColor: COLORS.primary, backgroundColor: '#f0fdf9' },
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  boxTick: { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 16 },
  colText: { fontSize: 14, color: COLORS.text },
  colTextOn: { fontWeight: '600', color: COLORS.primaryDark },
  miniRow: { flexDirection: 'row', gap: 18, marginBottom: 12 },

  // IA
  mic: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  micRec: { backgroundColor: COLORS.danger },
  micText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  recHint: { color: COLORS.danger, fontSize: 12, marginTop: 8, textAlign: 'center' },
  iaHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  transcripcion: { color: COLORS.text, fontStyle: 'italic', marginBottom: 8 },
  narr: {
    backgroundColor: COLORS.okBg,
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  narrText: { color: '#065f46', fontSize: 14, lineHeight: 20 },
});
