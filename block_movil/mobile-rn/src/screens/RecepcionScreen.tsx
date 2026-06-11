import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery, useMutation } from '@apollo/client';
import { usePaginacion, PiePaginacion } from '../ui/paginacion';
import {
  PACIENTES,
  CREAR_PACIENTE,
  ACTUALIZAR_PACIENTE,
} from '../graphql/queries';
import {
  Screen,
  Card,
  Field,
  PrimaryButton,
  OutlineButton,
  Loading,
  ErrorState,
  EmptyState,
  Banner,
  SectionTitle,
  COLORS,
} from '../ui/kit';

interface Paciente {
  id: string;
  ci: string;
  nombre: string;
  apellido: string;
  telefono?: string | null;
  email?: string | null;
  fechaNacimiento?: string | null;
}

export function RecepcionScreen() {
  const [q, setQ] = useState('');
  const { data, loading, error, refetch } = useQuery<any>(PACIENTES, {
    variables: { q: null },
    fetchPolicy: 'cache-and-network',
  });
  const [editing, setEditing] = useState<Paciente | null>(null);
  const [creating, setCreating] = useState(false);

  const pacientes: Paciente[] = data?.pacientes ?? [];
  const filtrados = q.trim()
    ? pacientes.filter(
        (p) =>
          `${p.nombre} ${p.apellido}`.toLowerCase().includes(q.toLowerCase()) ||
          p.ci.includes(q.trim())
      )
    : pacientes;
  const pag = usePaginacion(filtrados, 15);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error.message} />;


  if (creating) {
    return (
      <Screen>
        <PacienteForm
          onCancel={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            refetch();
          }}
        />
      </Screen>
    );
  }

  if (editing) {
    return (
      <Screen>
        <PacienteForm
          paciente={editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <FlatList
        data={pag.items}
        onEndReached={pag.cargarMas}
        onEndReachedThreshold={0.4}
        ListFooterComponent={<PiePaginacion {...pag.pie} />}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            <OutlineButton title="+ Registrar paciente" onPress={() => setCreating(true)} />
            <View style={{ height: 8 }} />
            <Field
              label="Buscar"
              value={q}
              onChangeText={setQ}
              placeholder="Nombre o CI"
              autoCapitalize="none"
            />
            <SectionTitle>Pacientes ({filtrados.length})</SectionTitle>
          </View>
        }
        ListEmptyComponent={<EmptyState message="No hay pacientes." />}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setEditing(item)} activeOpacity={0.7}>
            <Card>
              <Text style={s.name}>
                {item.nombre} {item.apellido}
              </Text>
              <Text style={s.meta}>CI: {item.ci}</Text>
              {item.telefono ? <Text style={s.meta}>Tel: {item.telefono}</Text> : null}
              {item.email ? <Text style={s.meta}>{item.email}</Text> : null}
              <Text style={s.edit}>Tocar para editar ›</Text>
            </Card>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

function PacienteForm({
  paciente,
  onCancel,
  onDone,
}: {
  paciente?: Paciente;
  onCancel: () => void;
  onDone: () => void;
}) {
  const editMode = !!paciente;
  const [ci, setCi] = useState(paciente?.ci ?? '');
  const [nombre, setNombre] = useState(paciente?.nombre ?? '');
  const [apellido, setApellido] = useState(paciente?.apellido ?? '');
  const [telefono, setTelefono] = useState(paciente?.telefono ?? '');
  const [email, setEmail] = useState(paciente?.email ?? '');
  const [fechaNac, setFechaNac] = useState(
    paciente?.fechaNacimiento ? paciente.fechaNacimiento.substring(0, 10) : ''
  );
  const [err, setErr] = useState<string | null>(null);

  const [crear, { loading: creating }] = useMutation(CREAR_PACIENTE, {
    onCompleted: onDone,
    onError: (e) => setErr(e.message),
  });
  const [actualizar, { loading: updating }] = useMutation(ACTUALIZAR_PACIENTE, {
    onCompleted: onDone,
    onError: (e) => setErr(e.message),
  });

  function submit() {
    setErr(null);
    if (!ci.trim() || !nombre.trim() || !apellido.trim()) {
      return setErr('CI, nombre y apellido son obligatorios.');
    }
    let fechaIso: string | null = null;
    if (fechaNac.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNac)) return setErr('Fecha inválida (AAAA-MM-DD).');
      const d = new Date(`${fechaNac}T00:00:00`);
      if (Number.isNaN(d.getTime())) return setErr('Fecha de nacimiento no válida.');
      fechaIso = d.toISOString();
    }
    const input = {
      ci: ci.trim(),
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      fechaNacimiento: fechaIso,
    };
    if (editMode) actualizar({ variables: { id: paciente!.id, input } });
    else crear({ variables: { input } });
  }

  return (
    <Card>
      <SectionTitle>{editMode ? 'Editar paciente' : 'Registrar paciente'}</SectionTitle>
      {err && <Banner kind="error" message={err} />}
      <Field label="CI *" value={ci} onChangeText={setCi} placeholder="Cédula de identidad" keyboardType="numbers-and-punctuation" />
      <Field label="Nombre *" value={nombre} onChangeText={setNombre} />
      <Field label="Apellido *" value={apellido} onChangeText={setApellido} />
      <Field label="Teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Fecha de nacimiento (AAAA-MM-DD)" value={fechaNac} onChangeText={setFechaNac} placeholder="1990-05-20" keyboardType="numbers-and-punctuation" />
      <PrimaryButton
        title={editMode ? 'Guardar cambios' : 'Registrar'}
        onPress={submit}
        loading={creating || updating}
      />
      <View style={{ height: 8 }} />
      <OutlineButton title="Cancelar" onPress={onCancel} color={COLORS.textMuted} />
    </Card>
  );
}

const s = StyleSheet.create({
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  edit: { fontSize: 12, color: COLORS.primary, marginTop: 8, fontWeight: '600' },
});
