import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { useQuery, useMutation } from '@apollo/client';
import { FACTURAS, ANULAR_FACTURA, CREAR_CHECKOUT_FACTURA } from '../graphql/queries';
import { usePaginacion, PiePaginacion } from '../ui/paginacion';
import {
  Screen,
  Card,
  Badge,
  Loading,
  ErrorState,
  EmptyState,
  SectionTitle,
  COLORS,
  money,
  fmtFechaHora,
} from '../ui/kit';

function estadoBadge(estado: string) {
  if (estado === 'PAGADA') return { bg: COLORS.okBg, color: COLORS.ok };
  if (estado === 'PENDIENTE') return { bg: COLORS.warnBg, color: COLORS.warn };
  return { bg: COLORS.dangerBg, color: COLORS.danger }; // ANULADA
}

export function FacturasScreen() {
  const { data, loading, error, refetch } = useQuery<any>(FACTURAS, {
    fetchPolicy: 'cache-and-network',
  });

  const facturas: any[] = data?.facturas ?? [];
  const pag = usePaginacion(facturas, 15);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error.message} />;


  return (
    <Screen scroll={false}>
      <FlatList
        data={pag.items}
        onEndReached={pag.cargarMas}
        onEndReachedThreshold={0.4}
        ListFooterComponent={<PiePaginacion {...pag.pie} />}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListHeaderComponent={<SectionTitle>Facturas ({facturas.length})</SectionTitle>}
        ListEmptyComponent={<EmptyState message="No hay facturas registradas." />}
        renderItem={({ item }) => <FacturaCard f={item} onChanged={() => refetch()} />}
      />
    </Screen>
  );
}

function FacturaCard({ f, onChanged }: { f: any; onChanged: () => void }) {
  const [anular, { loading: la }] = useMutation(ANULAR_FACTURA, {
    onCompleted: onChanged,
    onError: (e) => Alert.alert('Error', e.message),
  });
  const [checkout, { loading: lc }] = useMutation(CREAR_CHECKOUT_FACTURA, {
    onCompleted: (d) => {
      const url = d?.crearCheckoutFactura;
      if (url) Linking.openURL(url);
      else Alert.alert('Pago', 'No se obtuvo el enlace de pago.');
    },
    onError: (e) => Alert.alert('Error', e.message),
  });

  const badge = estadoBadge(f.estado);
  const pendiente = f.estado === 'PENDIENTE';

  function confirmAnular() {
    Alert.alert('Anular factura', `¿Anular la factura ${f.numero}?`, [
      { text: 'No' },
      {
        text: 'Sí, anular',
        style: 'destructive',
        onPress: () => anular({ variables: { id: f.id, motivo: 'Anulada desde la app' } }),
      },
    ]);
  }

  return (
    <Card>
      <View style={s.row}>
        <Text style={s.numero}>Factura {f.numero}</Text>
        <Badge text={f.estado} bg={badge.bg} color={badge.color} />
      </View>
      <Text style={s.fecha}>{fmtFechaHora(f.fecha)}</Text>
      <View style={s.totalRow}>
        <Text style={s.metodo}>{f.metodoPago}</Text>
        <Text style={s.total}>{money(f.total)}</Text>
      </View>
      {f.descuento && parseFloat(String(f.descuento)) > 0 ? (
        <Text style={s.meta}>Descuento: {money(f.descuento)}</Text>
      ) : null}

      {f.detalles?.length ? (
        <View style={s.detalles}>
          {f.detalles.map((d: any) => (
            <Text key={d.id} style={s.detalle}>
              • {d.medicamento?.nombre} × {d.cantidad} — {money(d.subtotal)}
            </Text>
          ))}
        </View>
      ) : null}

      {pendiente && (
        <View style={{ marginTop: 10 }}>
          <TouchableOpacity
            onPress={() => checkout({ variables: { facturaId: f.id } })}
            disabled={lc}
            style={s.payBtn}
          >
            <Text style={s.payText}>{lc ? 'Generando…' : 'Generar enlace de pago (Stripe)'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmAnular} disabled={la} style={s.anularBtn}>
            <Text style={s.anularText}>{la ? 'Anulando…' : 'Anular factura'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  fecha: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  metodo: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  total: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  detalles: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  detalle: { fontSize: 13, color: COLORS.text, marginTop: 2 },
  payBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingVertical: 9,
    alignItems: 'center',
    marginBottom: 8,
  },
  payText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  anularBtn: { borderWidth: 1, borderColor: COLORS.danger, borderRadius: 6, paddingVertical: 8, alignItems: 'center' },
  anularText: { color: COLORS.danger, fontWeight: '700', fontSize: 13 },
});
