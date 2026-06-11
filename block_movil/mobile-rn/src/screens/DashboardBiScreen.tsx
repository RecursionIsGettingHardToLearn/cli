import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@apollo/client';
import {
  BI_VENTAS_DIARIAS,
  BI_TOP_MEDICAMENTOS,
  BI_INVENTARIO_CRITICO,
  BI_RECETAS_BLOCKCHAIN,
} from '../graphql/queries';
import {
  Card,
  SectionTitle,
  Badge,
  ChipSelect,
  Loading,
  ErrorState,
  EmptyState,
  COLORS,
  money,
  fmtFecha,
} from '../ui/kit';

/**
 * Dashboard BI (solo ADMINISTRADOR).
 * Replica las graficas de la web usando barras simples hechas con Views
 * (sin librerias de charting, para no agregar dependencias al movil).
 */

const RANGOS = [7, 30, 90] as const;
const LIMITES = [5, 10, 20] as const;

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? parseFloat(v) : v ?? 0;
  return Number.isNaN(n as number) ? 0 : (n as number);
}

/** Barra horizontal proporcional al maximo de la serie. */
function Bar({
  label,
  value,
  max,
  caption,
  color = COLORS.primary,
}: {
  label: string;
  value: number;
  max: number;
  caption?: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <View style={styles.barRow}>
      <View style={styles.barHeader}>
        <Text style={styles.barLabel} numberOfLines={1}>
          {label}
        </Text>
        {caption ? <Text style={styles.barCaption}>{caption}</Text> : null}
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function nivelColor(nivel: string) {
  const n = (nivel || '').toUpperCase();
  if (n.includes('AGOT') || n.includes('CRIT')) return { bg: COLORS.dangerBg, color: COLORS.danger };
  if (n.includes('BAJO') || n.includes('ALERTA')) return { bg: COLORS.warnBg, color: COLORS.warn };
  return { bg: COLORS.infoBg, color: COLORS.info };
}

export function DashboardBiScreen() {
  const [dias, setDias] = useState<number>(30);
  const [limit, setLimit] = useState<number>(10);

  const hasta = ymd(new Date());
  const desde = ymd(new Date(Date.now() - dias * 86400000));

  const ventas = useQuery<any>(BI_VENTAS_DIARIAS, {
    variables: { desde, hasta },
    fetchPolicy: 'cache-and-network',
  });
  const top = useQuery<any>(BI_TOP_MEDICAMENTOS, {
    variables: { limit },
    fetchPolicy: 'cache-and-network',
  });
  const critico = useQuery<any>(BI_INVENTARIO_CRITICO, {
    fetchPolicy: 'cache-and-network',
  });
  const blockchain = useQuery<any>(BI_RECETAS_BLOCKCHAIN, {
    variables: { desde, hasta },
    fetchPolicy: 'cache-and-network',
  });

  const anyLoading =
    ventas.loading || top.loading || critico.loading || blockchain.loading;
  const firstError =
    ventas.error || top.error || critico.error || blockchain.error;

  const noData =
    !ventas.data && !top.data && !critico.data && !blockchain.data;

  if (anyLoading && noData) return <Loading />;
  if (firstError && noData) return <ErrorState message={firstError.message} />;

  const refetchAll = () => {
    ventas.refetch();
    top.refetch();
    critico.refetch();
    blockchain.refetch();
  };

  const ventasArr: any[] = ventas.data?.biVentasDiarias ?? [];
  const topArr: any[] = top.data?.biTopMedicamentos ?? [];
  const criticoArr: any[] = critico.data?.biInventarioCritico ?? [];
  const blockArr: any[] = blockchain.data?.biRecetasBlockchain ?? [];

  // KPIs derivados de ventas diarias
  const totalVendido = ventasArr.reduce((s, v) => s + num(v.totalVendido), 0);
  const totalFacturas = ventasArr.reduce((s, v) => s + num(v.numFacturas), 0);
  const ticketProm = totalFacturas > 0 ? totalVendido / totalFacturas : 0;

  const maxVenta = Math.max(1, ...ventasArr.map(v => num(v.totalVendido)));
  const maxTop = Math.max(1, ...topArr.map(t => num(t.montoTotal)));
  const maxRecetas = Math.max(1, ...blockArr.map(b => num(b.totalRecetas)));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={anyLoading} onRefresh={refetchAll} />}
    >
      {/* KPIs */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{money(totalVendido)}</Text>
          <Text style={styles.kpiLabel}>Vendido ({dias}d)</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{totalFacturas}</Text>
          <Text style={styles.kpiLabel}>Facturas</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{money(ticketProm)}</Text>
          <Text style={styles.kpiLabel}>Ticket prom.</Text>
        </View>
      </View>

      {/* Ventas diarias */}
      <Card>
        <SectionTitle>Ventas por dia</SectionTitle>
        <ChipSelect
          options={RANGOS}
          value={dias}
          onChange={setDias}
          labelOf={d => `${d} dias`}
        />
        {ventasArr.length === 0 ? (
          <EmptyState message="Sin ventas en el rango." />
        ) : (
          ventasArr
            .slice()
            .sort((a, b) => String(a.dia).localeCompare(String(b.dia)))
            .map((v, i) => (
              <Bar
                key={i}
                label={fmtFecha(v.dia)}
                value={num(v.totalVendido)}
                max={maxVenta}
                caption={`${money(v.totalVendido)} · ${num(v.numFacturas)} fact.`}
              />
            ))
        )}
      </Card>

      {/* Top medicamentos */}
      <Card>
        <SectionTitle>Top medicamentos vendidos</SectionTitle>
        <ChipSelect
          options={LIMITES}
          value={limit}
          onChange={setLimit}
          labelOf={n => `Top ${n}`}
        />
        {topArr.length === 0 ? (
          <EmptyState message="Sin datos de ventas." />
        ) : (
          topArr.map((t, i) => (
            <Bar
              key={t.medicamentoId ?? i}
              label={t.medicamento}
              value={num(t.montoTotal)}
              max={maxTop}
              caption={`${money(t.montoTotal)} · ${num(t.unidadesVendidas)} u.`}
              color={COLORS.info}
            />
          ))
        )}
      </Card>

      {/* Inventario critico */}
      <Card>
        <SectionTitle>Inventario critico</SectionTitle>
        {criticoArr.length === 0 ? (
          <EmptyState message="Todo el stock esta en niveles normales." />
        ) : (
          criticoArr.map((c, i) => {
            const nc = nivelColor(c.nivel);
            return (
              <View key={c.medicamentoId ?? i} style={styles.critRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.critName} numberOfLines={1}>
                    {c.medicamento}
                  </Text>
                  <Text style={styles.critMeta}>
                    Stock {num(c.stockActual)} / min {num(c.stockMinimo)}
                  </Text>
                </View>
                <Badge text={c.nivel} bg={nc.bg} color={nc.color} />
              </View>
            );
          })
        )}
      </Card>

      {/* Recetas en blockchain */}
      <Card>
        <SectionTitle>Recetas y blockchain</SectionTitle>
        {blockArr.length === 0 ? (
          <EmptyState message="Sin recetas en el periodo." />
        ) : (
          blockArr
            .slice()
            .sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
            .map((b, i) => (
              <View key={i} style={styles.blockRow}>
                <Bar
                  label={fmtFecha(b.mes)}
                  value={num(b.totalRecetas)}
                  max={maxRecetas}
                  caption={`${num(b.totalRecetas)} recetas`}
                  color={COLORS.primary}
                />
                <View style={styles.blockChips}>
                  <Badge
                    text={`${num(b.registradasEnBlockchain)} en cadena`}
                    bg={COLORS.okBg}
                    color={COLORS.ok}
                  />
                  <Badge
                    text={`${num(b.controladas)} controladas`}
                    bg={COLORS.warnBg}
                    color={COLORS.warn}
                  />
                  <Badge
                    text={`${num(b.dispensadas)} dispensadas`}
                    bg={COLORS.infoBg}
                    color={COLORS.info}
                  />
                </View>
              </View>
            ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  kpiValue: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  kpiLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, textAlign: 'center' },

  barRow: { marginBottom: 10 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  barLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text, flex: 1, paddingRight: 6 },
  barCaption: { fontSize: 11, color: COLORS.textMuted },
  barTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#eef2f5',
    overflow: 'hidden',
  },
  barFill: { height: 10, borderRadius: 5 },

  critRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  critName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  critMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  blockRow: {
    paddingBottom: 10,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  blockChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
});
