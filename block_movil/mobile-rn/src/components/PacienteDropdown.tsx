import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useLazyQuery } from '@apollo/client';
import { PACIENTES } from '../graphql/queries';
import { Field, COLORS } from '../ui/kit';
import type { PacienteLite } from './PacienteSearch';

/**
 * Dropdown de pacientes: un selector desplegable que carga la lista completa
 * al abrirse (query `pacientes` del gateway) y permite filtrar escribiendo
 * por nombre, apellido o CI. Mismas props que PacienteSearch para poder
 * usarse como reemplazo directo.
 */
export function PacienteDropdown({
  selected,
  onSelect,
  onClear,
}: {
  selected: PacienteLite | null;
  onSelect: (p: PacienteLite) => void;
  onClear: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [cargar, { data, loading, error }] = useLazyQuery<any>(PACIENTES, {
    fetchPolicy: 'cache-and-network',
  });

  useEffect(() => {
    if (abierto) cargar({ variables: {} }); // sin q => lista completa
  }, [abierto, cargar]);

  const pacientes: PacienteLite[] = data?.pacientes ?? [];
  const filtrados = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    if (!t) return pacientes;
    return pacientes.filter(
      (p) =>
        `${p.nombre} ${p.apellido}`.toLowerCase().includes(t) ||
        (p.ci ?? '').toLowerCase().includes(t),
    );
  }, [pacientes, filtro]);

  function elegir(p: PacienteLite) {
    onSelect(p);
    setAbierto(false);
    setFiltro('');
  }

  if (selected) {
    return (
      <View style={s.selectedBox}>
        <View style={{ flex: 1 }}>
          <Text style={s.selectedName}>
            {selected.nombre} {selected.apellido}
          </Text>
          <Text style={s.selectedMeta}>CI: {selected.ci}</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            onClear();
            setAbierto(true);
          }}
          style={s.changeBtn}
        >
          <Text style={s.changeText}>Cambiar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <TouchableOpacity
        style={[s.trigger, abierto && s.triggerOpen]}
        onPress={() => setAbierto(!abierto)}
        activeOpacity={0.8}
      >
        <Text style={s.triggerText}>Selecciona un paciente…</Text>
        <Text style={s.caret}>{abierto ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {abierto && (
        <View style={s.panel}>
          <Field
            value={filtro}
            onChangeText={setFiltro}
            placeholder="Filtrar por nombre o CI"
            autoCapitalize="none"
          />
          {loading && pacientes.length === 0 && (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 10 }} />
          )}
          {error && (
            <Text style={s.noRes}>No se pudo cargar la lista. Revisa tu conexión.</Text>
          )}
          <ScrollView style={s.lista} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filtrados.map((p) => (
              <TouchableOpacity key={p.id} style={s.row} onPress={() => elegir(p)}>
                <Text style={s.rowName}>
                  {p.nombre} {p.apellido}
                </Text>
                <Text style={s.rowMeta}>CI {p.ci}</Text>
              </TouchableOpacity>
            ))}
            {!loading && filtrados.length === 0 && !error && (
              <Text style={s.noRes}>
                {pacientes.length === 0 ? 'No hay pacientes registrados.' : 'Sin coincidencias para el filtro.'}
              </Text>
            )}
          </ScrollView>
          <Text style={s.count}>
            {filtrados.length} de {pacientes.length} paciente(s)
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 13,
    backgroundColor: '#fff',
  },
  triggerOpen: { borderColor: COLORS.primary },
  triggerText: { color: COLORS.textMuted, fontSize: 14 },
  caret: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  panel: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginTop: 6,
    padding: 10,
    backgroundColor: '#fff',
  },
  lista: { maxHeight: 240 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowName: { color: COLORS.text, fontSize: 14, fontWeight: '600', flex: 1, paddingRight: 8 },
  rowMeta: { color: COLORS.textMuted, fontSize: 12 },
  noRes: { color: COLORS.textMuted, fontSize: 13, paddingVertical: 10, textAlign: 'center' },
  count: { color: COLORS.textMuted, fontSize: 11, textAlign: 'right', marginTop: 6 },
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
});
