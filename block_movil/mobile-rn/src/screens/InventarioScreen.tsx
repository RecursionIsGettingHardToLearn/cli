import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useLazyQuery } from '@apollo/client';
import {
  MEDICAMENTOS,
  CATEGORIAS,
  LOTES_POR_MEDICAMENTO,
  CREAR_MEDICAMENTO,
  REGISTRAR_ENTRADA_LOTE,
} from '../graphql/queries';
import {
  Screen,
  Card,
  Field,
  PrimaryButton,
  OutlineButton,
  Badge,
  Loading,
  ErrorState,
  EmptyState,
  Banner,
  ChipSelect,
  SectionTitle,
  COLORS,
  money,
  fmtFecha,
} from '../ui/kit';

interface Medicamento {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precioVenta: string | number;
  requiereReceta: boolean;
  controlado: boolean;
  stockMinimo: number;
  activo: boolean;
  categoria?: { id: number; nombre: string } | null;
}

export function InventarioScreen() {
  const [q, setQ] = useState('');
  const { data, loading, error, refetch } = useQuery<any>(MEDICAMENTOS, {
    variables: { q: null, activo: true },
    fetchPolicy: 'cache-and-network',
  });
  const [creating, setCreating] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error.message} />;

  const meds: Medicamento[] = data?.medicamentos ?? [];
  const filtrados = q.trim()
    ? meds.filter((m) => m.nombre.toLowerCase().includes(q.toLowerCase()))
    : meds;

  if (creating) {
    return (
      <Screen>
        <CrearMedicamentoForm
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <FlatList
        data={filtrados}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            <OutlineButton title="+ Nuevo medicamento" onPress={() => setCreating(true)} />
            <View style={{ height: 8 }} />
            <Field label="Buscar" value={q} onChangeText={setQ} placeholder="Nombre del medicamento" autoCapitalize="none" />
            <SectionTitle>Medicamentos ({filtrados.length})</SectionTitle>
          </View>
        }
        ListEmptyComponent={<EmptyState message="No hay medicamentos." />}
        renderItem={({ item }) => <MedicamentoCard m={item} />}
      />
    </Screen>
  );
}

function MedicamentoCard({ m }: { m: Medicamento }) {
  const [expand, setExpand] = useState(false);
  const [cargarLotes, { data, loading, refetch }] = useLazyQuery<any>(LOTES_POR_MEDICAMENTO, {
    fetchPolicy: 'network-only',
  });
  const [addLote, setAddLote] = useState(false);

  function toggle() {
    if (!expand) cargarLotes({ variables: { medicamentoId: m.id } });
    setExpand((v) => !v);
  }

  const lotes: any[] = data?.lotesByMedicamento ?? [];
  const stockTotal = lotes.reduce((acc, l) => acc + (l.cantidadActual ?? 0), 0);
  const bajoStock = expand && stockTotal <= m.stockMinimo;

  return (
    <Card>
      <View style={s.row}>
        <Text style={s.name}>{m.nombre}</Text>
        <Text style={s.precio}>{money(m.precioVenta)}</Text>
      </View>
      <View style={s.badges}>
        {m.controlado && <Badge text="Controlado" bg={COLORS.dangerBg} color={COLORS.danger} />}
        {m.requiereReceta && <Badge text="Requiere receta" bg={COLORS.warnBg} color={COLORS.warn} />}
        {m.categoria && <Badge text={m.categoria.nombre} />}
      </View>
      {m.descripcion ? <Text style={s.desc}>{m.descripcion}</Text> : null}
      <Text style={s.meta}>Stock mínimo: {m.stockMinimo}</Text>

      <TouchableOpacity onPress={toggle} style={{ marginTop: 8 }}>
        <Text style={s.toggle}>{expand ? 'Ocultar stock' : 'Ver stock / lotes ›'}</Text>
      </TouchableOpacity>

      {expand && (
        <View style={{ marginTop: 8 }}>
          {loading ? (
            <Text style={s.meta}>Cargando lotes…</Text>
          ) : (
            <>
              <Text style={[s.stock, bajoStock && { color: COLORS.danger }]}>
                Stock total: {stockTotal} unidades {bajoStock ? '⚠ bajo mínimo' : ''}
              </Text>
              {lotes.length === 0 && <Text style={s.meta}>Sin lotes registrados.</Text>}
              {lotes.map((l) => (
                <View key={l.id} style={s.loteRow}>
                  <Text style={s.loteText}>
                    Lote {l.codigoLote} · {l.cantidadActual}/{l.cantidadInicial}
                  </Text>
                  <Text style={s.loteVto}>Vence {fmtFecha(l.fechaVencimiento)}</Text>
                </View>
              ))}
              <OutlineButton
                title={addLote ? 'Cancelar entrada' : '+ Registrar entrada de lote'}
                onPress={() => setAddLote((v) => !v)}
              />
              {addLote && (
                <EntradaLoteForm
                  medicamentoId={m.id}
                  onDone={() => {
                    setAddLote(false);
                    refetch && refetch();
                  }}
                />
              )}
            </>
          )}
        </View>
      )}
    </Card>
  );
}

function EntradaLoteForm({ medicamentoId, onDone }: { medicamentoId: string; onDone: () => void }) {
  const [codigoLote, setCodigoLote] = useState('');
  const [fechaVto, setFechaVto] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [precioCompra, setPrecioCompra] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const [registrar, { loading }] = useMutation(REGISTRAR_ENTRADA_LOTE, {
    onCompleted: onDone,
    onError: (e) => setErr(e.message),
  });

  function submit() {
    setErr(null);
    if (!codigoLote.trim()) return setErr('Código de lote requerido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaVto)) return setErr('Fecha de vencimiento inválida (AAAA-MM-DD).');
    const cant = parseInt(cantidad, 10);
    const precio = parseFloat(precioCompra);
    if (!Number.isFinite(cant) || cant <= 0) return setErr('Cantidad inválida.');
    if (!Number.isFinite(precio) || precio < 0) return setErr('Precio de compra inválido.');
    registrar({
      variables: {
        input: {
          medicamentoId,
          codigoLote: codigoLote.trim(),
          fechaVencimiento: fechaVto,
          cantidad: cant,
          precioCompra: precio,
        },
      },
    });
  }

  return (
    <View style={s.formInner}>
      {err && <Banner kind="error" message={err} />}
      <Field label="Código de lote" value={codigoLote} onChangeText={setCodigoLote} />
      <Field label="Vencimiento (AAAA-MM-DD)" value={fechaVto} onChangeText={setFechaVto} placeholder="2027-12-31" keyboardType="numbers-and-punctuation" />
      <Field label="Cantidad" value={cantidad} onChangeText={setCantidad} keyboardType="number-pad" />
      <Field label="Precio compra (Bs)" value={precioCompra} onChangeText={setPrecioCompra} keyboardType="decimal-pad" />
      <PrimaryButton title="Registrar entrada" onPress={submit} loading={loading} />
    </View>
  );
}

function CrearMedicamentoForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const { data: catData } = useQuery<any>(CATEGORIAS, { fetchPolicy: 'cache-first' });
  const categorias: any[] = catData?.categorias ?? [];

  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');
  const [stockMin, setStockMin] = useState('5');
  const [requiereReceta, setRequiereReceta] = useState<'Sí' | 'No'>('No');
  const [controlado, setControlado] = useState<'Sí' | 'No'>('No');
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [crear, { loading }] = useMutation(CREAR_MEDICAMENTO, {
    onCompleted: onDone,
    onError: (e) => setErr(e.message),
  });

  function submit() {
    setErr(null);
    if (!nombre.trim()) return setErr('Nombre requerido.');
    const p = parseFloat(precio);
    if (!Number.isFinite(p) || p < 0) return setErr('Precio de venta inválido.');
    const sm = parseInt(stockMin, 10);
    crear({
      variables: {
        input: {
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          categoriaId,
          precioVenta: p,
          requiereReceta: requiereReceta === 'Sí',
          controlado: controlado === 'Sí',
          stockMinimo: Number.isFinite(sm) ? sm : 0,
        },
      },
    });
  }

  return (
    <Card>
      <SectionTitle>Nuevo medicamento</SectionTitle>
      {err && <Banner kind="error" message={err} />}
      <Field label="Nombre *" value={nombre} onChangeText={setNombre} />
      <Field label="Descripción" value={descripcion} onChangeText={setDescripcion} multiline />
      <Field label="Precio de venta (Bs) *" value={precio} onChangeText={setPrecio} keyboardType="decimal-pad" />
      <Field label="Stock mínimo" value={stockMin} onChangeText={setStockMin} keyboardType="number-pad" />
      {categorias.length > 0 && (
        <>
          <Text style={s.label}>Categoría</Text>
          <ChipSelect
            options={categorias.map((c) => c.id)}
            value={categoriaId ?? undefined}
            onChange={(id) => setCategoriaId(id)}
            labelOf={(id) => categorias.find((c) => c.id === id)?.nombre ?? String(id)}
          />
        </>
      )}
      <Text style={s.label}>¿Requiere receta?</Text>
      <ChipSelect options={['No', 'Sí'] as const} value={requiereReceta} onChange={setRequiereReceta} />
      <Text style={s.label}>¿Es controlado?</Text>
      <ChipSelect options={['No', 'Sí'] as const} value={controlado} onChange={setControlado} />
      <PrimaryButton title="Crear medicamento" onPress={submit} loading={loading} />
      <View style={{ height: 8 }} />
      <OutlineButton title="Cancelar" onPress={onCancel} color={COLORS.textMuted} />
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 8 },
  precio: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  desc: { fontSize: 13, color: COLORS.textMuted, marginTop: 8 },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  toggle: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  stock: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  loteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  loteText: { fontSize: 13, color: COLORS.text },
  loteVto: { fontSize: 11, color: COLORS.textMuted },
  formInner: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4 },
});
