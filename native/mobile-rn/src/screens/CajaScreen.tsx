import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, Alert } from 'react-native';
import { useLazyQuery, useMutation } from '@apollo/client';
import { MEDICAMENTOS, CREAR_FACTURA, CREAR_CHECKOUT_FACTURA } from '../graphql/queries';
import {
  Screen,
  Card,
  Field,
  PrimaryButton,
  OutlineButton,
  Badge,
  Banner,
  ChipSelect,
  SectionTitle,
  COLORS,
  money,
} from '../ui/kit';
import { PacienteSearch, type PacienteLite } from '../components/PacienteSearch';

const METODOS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'QR'] as const;
type Metodo = (typeof METODOS)[number];

interface CartItem {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export function CajaScreen() {
  const [q, setQ] = useState('');
  const [buscar, { data, loading }] = useLazyQuery<any>(MEDICAMENTOS, { fetchPolicy: 'network-only' });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [metodo, setMetodo] = useState<Metodo>('EFECTIVO');
  const [descuento, setDescuento] = useState('0');
  const [paciente, setPaciente] = useState<PacienteLite | null>(null);
  const [pendiente, setPendiente] = useState<'Cobrar ahora' | 'Dejar pendiente'>('Cobrar ahora');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [crearFactura, { loading: saving }] = useMutation(CREAR_FACTURA, {
    onError: (e) => setMsg({ kind: 'error', text: e.message }),
  });
  const [checkout, { loading: lc }] = useMutation(CREAR_CHECKOUT_FACTURA, {
    onCompleted: (d) => {
      const url = d?.crearCheckoutFactura;
      if (url) Linking.openURL(url);
    },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const resultados: any[] = data?.medicamentos ?? [];
  const subtotal = cart.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const desc = parseFloat(descuento) || 0;
  const total = Math.max(0, subtotal - desc);

  function addItem(m: any) {
    setCart((prev) => {
      const ex = prev.find((i) => i.id === m.id);
      if (ex) return prev.map((i) => (i.id === m.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      return [...prev, { id: m.id, nombre: m.nombre, precio: parseFloat(String(m.precioVenta)) || 0, cantidad: 1 }];
    });
  }
  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0)
    );
  }

  async function emitir() {
    setMsg(null);
    if (cart.length === 0) return setMsg({ kind: 'error', text: 'El carrito está vacío.' });
    const dejarPendiente = pendiente === 'Dejar pendiente';
    const res = await crearFactura({
      variables: {
        input: {
          pacienteId: paciente?.id ?? null,
          metodoPago: metodo,
          descuento: desc,
          pendiente: dejarPendiente,
          items: cart.map((i) => ({ medicamentoId: i.id, cantidad: i.cantidad })),
        },
      },
    });
    const factura = res.data?.crearFactura;
    if (factura) {
      setMsg({ kind: 'ok', text: `Factura ${factura.numero} emitida · ${money(factura.total)}` });
      setCart([]);
      setDescuento('0');
      setPaciente(null);
      // Si quedó pendiente, ofrecer generar enlace de pago directo.
      if (dejarPendiente) {
        Alert.alert('Factura pendiente', '¿Generar enlace de pago (Stripe) ahora?', [
          { text: 'No' },
          { text: 'Sí', onPress: () => checkout({ variables: { facturaId: factura.id } }) },
        ]);
      }
    }
  }

  return (
    <Screen>
      <Card>
        <SectionTitle>Buscar medicamento</SectionTitle>
        <Field
          label="Nombre"
          value={q}
          onChangeText={(t) => {
            setQ(t);
            if (t.trim().length >= 2) buscar({ variables: { q: t.trim(), activo: true } });
          }}
          placeholder="Ej: Paracetamol"
          autoCapitalize="none"
        />
        {loading && <ActivityIndicator color={COLORS.primary} />}
        {resultados.slice(0, 6).map((m) => (
          <TouchableOpacity key={m.id} style={s.resRow} onPress={() => addItem(m)}>
            <Text style={s.resName}>{m.nombre}</Text>
            <Text style={s.resPrice}>{money(m.precioVenta)} +</Text>
          </TouchableOpacity>
        ))}
      </Card>

      <Card>
        <SectionTitle>Carrito ({cart.length})</SectionTitle>
        {cart.length === 0 && <Text style={s.muted}>Agrega medicamentos desde el buscador.</Text>}
        {cart.map((i) => (
          <View key={i.id} style={s.cartRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.cartName}>{i.nombre}</Text>
              <Text style={s.cartSub}>
                {money(i.precio)} × {i.cantidad} = {money(i.precio * i.cantidad)}
              </Text>
            </View>
            <View style={s.qtyBox}>
              <TouchableOpacity onPress={() => changeQty(i.id, -1)} style={s.qtyBtn}>
                <Text style={s.qtySign}>−</Text>
              </TouchableOpacity>
              <Text style={s.qtyNum}>{i.cantidad}</Text>
              <TouchableOpacity onPress={() => changeQty(i.id, 1)} style={s.qtyBtn}>
                <Text style={s.qtySign}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </Card>

      {cart.length > 0 && (
        <Card>
          <SectionTitle>Cobro</SectionTitle>
          <Text style={s.label}>Paciente (opcional)</Text>
          <PacienteSearch selected={paciente} onSelect={setPaciente} onClear={() => setPaciente(null)} />
          <Text style={s.label}>Método de pago</Text>
          <ChipSelect options={METODOS} value={metodo} onChange={setMetodo} />
          <Field label="Descuento (Bs)" value={descuento} onChangeText={setDescuento} keyboardType="decimal-pad" />
          <Text style={s.label}>Cobro</Text>
          <ChipSelect options={['Cobrar ahora', 'Dejar pendiente'] as const} value={pendiente} onChange={setPendiente} />

          <View style={s.totales}>
            <Row label="Subtotal" value={money(subtotal)} />
            {desc > 0 && <Row label="Descuento" value={`- ${money(desc)}`} />}
            <Row label="TOTAL" value={money(total)} big />
          </View>

          {msg && <Banner kind={msg.kind} message={msg.text} />}
          <PrimaryButton title="Emitir factura" onPress={emitir} loading={saving || lc} />
        </Card>
      )}

      {msg && cart.length === 0 && <Banner kind={msg.kind} message={msg.text} />}
    </Screen>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={s.totRow}>
      <Text style={[s.totLabel, big && s.totLabelBig]}>{label}</Text>
      <Text style={[s.totValue, big && s.totValueBig]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  resRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resName: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  resPrice: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  muted: { fontSize: 13, color: COLORS.textMuted },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cartName: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  cartSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  qtyBox: { flexDirection: 'row', alignItems: 'center' },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtySign: { color: COLORS.primary, fontSize: 18, fontWeight: '700' },
  qtyNum: { width: 34, textAlign: 'center', fontSize: 15, fontWeight: '700', color: COLORS.text },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4, marginTop: 4 },
  totales: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  totLabel: { fontSize: 13, color: COLORS.textMuted },
  totLabelBig: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  totValue: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  totValueBig: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
});
