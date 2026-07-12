import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useLazyQuery } from '@apollo/client';
import { PACIENTES } from '../graphql/queries';
import { Field, COLORS } from '../ui/kit';

export interface PacienteLite {
  id: string;
  ci: string;
  nombre: string;
  apellido: string;
  telefono?: string | null;
  email?: string | null;
  fechaNacimiento?: string | null;
}

/**
 * Buscador de pacientes reutilizable: input + resultados tocables.
 * Llama onSelect con el paciente elegido. Si ya hay uno seleccionado, muestra
 * un chip con opcion de cambiarlo.
 */
export function PacienteSearch({
  selected,
  onSelect,
  onClear,
}: {
  selected: PacienteLite | null;
  onSelect: (p: PacienteLite) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState('');
  const [buscar, { data, loading }] = useLazyQuery<any>(PACIENTES, {
    fetchPolicy: 'network-only',
  });

  if (selected) {
    return (
      <View style={s.selectedBox}>
        <View style={{ flex: 1 }}>
          <Text style={s.selectedName}>
            {selected.nombre} {selected.apellido}
          </Text>
          <Text style={s.selectedMeta}>CI: {selected.ci}</Text>
        </View>
        <TouchableOpacity onPress={onClear} style={s.changeBtn}>
          <Text style={s.changeText}>Cambiar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const results: PacienteLite[] = data?.pacientes ?? [];

  return (
    <View>
      <Field
        label="Buscar paciente (nombre o CI)"
        value={q}
        onChangeText={(t) => {
          setQ(t);
          if (t.trim().length >= 2) buscar({ variables: { q: t.trim() } });
        }}
        placeholder="Ej: Maria o 1234567"
        autoCapitalize="none"
      />
      {loading && <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 6 }} />}
      {results.slice(0, 8).map((p) => (
        <TouchableOpacity key={p.id} style={s.resultRow} onPress={() => onSelect(p)}>
          <Text style={s.resultName}>
            {p.nombre} {p.apellido}
          </Text>
          <Text style={s.resultMeta}>CI {p.ci}</Text>
        </TouchableOpacity>
      ))}
      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <Text style={s.noRes}>Sin coincidencias.</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  selectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.okBg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  selectedName: { fontWeight: '700', color: COLORS.ok, fontSize: 14 },
  selectedMeta: { color: COLORS.ok, fontSize: 12, marginTop: 2 },
  changeBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  changeText: { color: COLORS.ok, fontWeight: '700', fontSize: 12 },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resultName: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  resultMeta: { color: COLORS.textMuted, fontSize: 12 },
  noRes: { color: COLORS.textMuted, fontSize: 13, paddingVertical: 8 },
});
