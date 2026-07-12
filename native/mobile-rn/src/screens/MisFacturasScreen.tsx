import React, { useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, TouchableOpacity, Linking, Alert } from 'react-native';
import { useQuery, useMutation } from '@apollo/client';
import { MIS_FACTURAS_PACIENTE, CREAR_CHECKOUT_FACTURA } from '../graphql/queries';
import { usePaginacion, PiePaginacion } from '../ui/paginacion';

export function MisFacturasScreen() {
  const { data, loading, error, refetch } = useQuery<any>(MIS_FACTURAS_PACIENTE, {
    fetchPolicy: 'cache-and-network',
  });

  const [crearCheckout] = useMutation(CREAR_CHECKOUT_FACTURA);
  const [pagandoId, setPagandoId] = useState<string | null>(null);

  const pagar = async (facturaId: string) => {
    setPagandoId(facturaId);
    try {
      const r = await crearCheckout({ variables: { facturaId } });
      const url = r.data?.crearCheckoutFactura;
      if (!url) throw new Error('Stripe no devolvio una URL de pago');
      await Linking.openURL(url);
      Alert.alert(
        'Pago en linea',
        'Completa el pago en la pagina de Stripe (tarjeta de prueba 4242 4242 4242 4242) y luego desliza hacia abajo para actualizar.'
      );
    } catch (e: any) {
      Alert.alert('Pago en linea', e?.message ?? 'No se pudo iniciar el pago');
    } finally {
      setPagandoId(null);
    }
  };

  const facturas: any[] = data?.misFacturas ?? [];
  const pag = usePaginacion(facturas, 15);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0f6e56" />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Error: {error.message}</Text>
      </View>
    );
  }


  return (
    <FlatList
      data={pag.items}
        onEndReached={pag.cargarMas}
        onEndReachedThreshold={0.4}
        ListFooterComponent={<PiePaginacion {...pag.pie} />}
      keyExtractor={f => f.id}
      contentContainerStyle={{ padding: 12 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refetch()} tintColor="#0f6e56" />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.empty}>No tienes facturas.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.numero}>{item.numero}</Text>
            <Text style={styles.total}>Bs {item.total}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{new Date(item.fecha).toLocaleDateString()}</Text>
            <Text style={styles.meta}>{item.metodoPago}</Text>
            <View style={[styles.badge, item.estado === 'PAGADA' ? styles.bgGreen : styles.bgGray]}>
              <Text style={styles.badgeText}>{item.estado}</Text>
            </View>
          </View>
          {item.detalles?.map((d: any, i: number) => (
            <Text key={i} style={styles.detalle}>
              • {d.medicamento.nombre} × {d.cantidad} = Bs {d.subtotal}
            </Text>
          ))}
          {item.estado === 'PENDIENTE' && (
            <TouchableOpacity
              style={[styles.btnPagar, pagandoId === item.id && styles.btnPagarOff]}
              disabled={pagandoId === item.id}
              onPress={() => pagar(item.id)}
            >
              <Text style={styles.btnPagarTexto}>
                {pagandoId === item.id ? 'Abriendo pago...' : 'Pagar en linea con tarjeta'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  empty: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
  error: { color: '#a32d2d', fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: 'white', borderRadius: 8, padding: 16, marginBottom: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  total: { fontSize: 18, fontWeight: '700', color: '#0f6e56' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12 },
  meta: { fontSize: 12, color: '#6b7280' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 3, marginLeft: 'auto' },
  bgGreen: { backgroundColor: '#d1fae5' },
  btnPagar: { marginTop: 10, backgroundColor: '#0f6e56', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnPagarOff: { opacity: 0.6 },
  btnPagarTexto: { color: '#fff', fontWeight: '600' },
  bgGray: { backgroundColor: '#e5e7eb' },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#065f46' },
  detalle: { fontSize: 13, color: '#4b5563', marginTop: 4 },
});
