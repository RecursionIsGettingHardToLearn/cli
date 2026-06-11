import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLazyQuery } from '@apollo/client';
import { HISTORIA_POR_PACIENTE } from '../graphql/queries';
import {
  Screen,
  Card,
  Badge,
  Loading,
  EmptyState,
  SectionTitle,
  COLORS,
  fmtFecha,
} from '../ui/kit';
import { PacienteSearch, type PacienteLite } from '../components/PacienteSearch';

export function HistoriaScreen() {
  const [paciente, setPaciente] = useState<PacienteLite | null>(null);
  const [cargar, { data, loading }] = useLazyQuery<any>(HISTORIA_POR_PACIENTE, {
    fetchPolicy: 'network-only',
  });

  function onSelect(p: PacienteLite) {
    setPaciente(p);
    cargar({ variables: { pacienteId: p.id } });
  }

  const historia = data?.historiaPorPaciente;
  const episodios: any[] = historia?.episodios ?? [];

  return (
    <Screen>
      <Card>
        <SectionTitle>Buscar historia clínica</SectionTitle>
        <PacienteSearch
          selected={paciente}
          onSelect={onSelect}
          onClear={() => setPaciente(null)}
        />
      </Card>

      {loading && <Loading />}

      {paciente && !loading && !historia && (
        <EmptyState message="Este paciente aún no tiene historia clínica abierta." />
      )}

      {historia && (
        <>
          <Card>
            <View style={s.row}>
              <Text style={s.title}>
                {paciente?.nombre} {paciente?.apellido}
              </Text>
              <Badge
                text={historia.estado}
                bg={historia.estado === 'ABIERTA' ? COLORS.okBg : COLORS.infoBg}
                color={historia.estado === 'ABIERTA' ? COLORS.ok : COLORS.info}
              />
            </View>
            <Text style={s.meta}>
              Abierta el {fmtFecha(historia.fechaApertura)} · {episodios.length} episodio(s)
            </Text>
          </Card>

          <SectionTitle>Episodios</SectionTitle>
          {episodios.length === 0 && <EmptyState message="Sin episodios registrados." />}
          {episodios
            .slice()
            .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
            .map((e) => (
              <Card key={e.id}>
                <Text style={s.epFecha}>{fmtFecha(e.fecha)}</Text>
                {e.motivoConsulta ? (
                  <Text style={s.epField}>
                    <Text style={s.epLabel}>Motivo: </Text>
                    {e.motivoConsulta}
                  </Text>
                ) : null}
                {e.evolucion ? (
                  <Text style={s.epField}>
                    <Text style={s.epLabel}>Evolución: </Text>
                    {e.evolucion}
                  </Text>
                ) : null}
                {e.diagnosticoTexto ? (
                  <Text style={s.epField}>
                    <Text style={s.epLabel}>Diagnóstico: </Text>
                    {e.diagnosticoTexto}
                  </Text>
                ) : null}
              </Card>
            ))}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text, flex: 1 },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 6 },
  epFecha: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginBottom: 6 },
  epField: { fontSize: 13, color: COLORS.text, marginTop: 3, lineHeight: 19 },
  epLabel: { fontWeight: '700', color: COLORS.textMuted },
});
