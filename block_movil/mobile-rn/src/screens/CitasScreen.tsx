import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useQuery, useMutation } from '@apollo/client';
import { useAuth } from '../auth/AuthContext';
import {
  MIS_CITAS,
  CITAS,
  CREAR_CITA,
  CANCELAR_CITA,
  USUARIOS,
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
  fmtFechaHora,
} from '../ui/kit';
import { PacienteSearch, type PacienteLite } from '../components/PacienteSearch';

const URGENCIAS = ['BAJA', 'MEDIA', 'ALTA'] as const;

function estadoBadge(estado: string) {
  if (estado === 'AGENDADA') return { bg: COLORS.infoBg, color: COLORS.info };
  if (estado === 'ATENDIDA') return { bg: COLORS.okBg, color: COLORS.ok };
  return { bg: COLORS.dangerBg, color: COLORS.danger }; // CANCELADA
}

export function CitasScreen() {
  const { user, session } = useAuth();
  const rol = user?.rol ?? 'PACIENTE';
  const esAdmin = rol === 'ADMINISTRADOR';
  const esMedico = rol === 'MEDICO';
  const puedeCrear = esAdmin || esMedico;

  // ADMIN ve todas las citas; MEDICO ve su agenda (citas donde el es el medico);
  // PACIENTE ve las suyas via misCitas.
  const listQuery = esAdmin || esMedico ? CITAS : MIS_CITAS;
  const { data, loading, error, refetch } = useQuery<any>(listQuery, {
    fetchPolicy: 'cache-and-network',
  });

  const [showForm, setShowForm] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error.message} />;

  const todas: any[] = (esAdmin || esMedico ? data?.citas : data?.misCitas) ?? [];
  const citas: any[] = esMedico
    ? todas.filter(c => c.medicoUid === session?.user?.id)
    : todas;

  return (
    <Screen scroll={false}>
      <FlatList
        data={citas}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {puedeCrear && (
              <OutlineButton
                title={showForm ? 'Cerrar formulario' : '+ Nueva cita'}
                onPress={() => setShowForm((v) => !v)}
              />
            )}
            {showForm && puedeCrear && (
              <NuevaCitaForm
                esAdmin={esAdmin}
                medicoUid={session?.user.id ?? ''}
                onDone={() => {
                  setShowForm(false);
                  refetch();
                }}
              />
            )}
            <SectionTitle>
              {esAdmin ? 'Todas las citas' : esMedico ? 'Mi agenda' : 'Mis citas'} ({citas.length})
            </SectionTitle>
          </View>
        }
        ListEmptyComponent={<EmptyState message="No hay citas para mostrar." />}
        renderItem={({ item }) => (
          <CitaCard item={item} puedeCancelar onCancel={() => refetch()} />
        )}
      />
    </Screen>
  );
}

function CitaCard({
  item,
  onCancel,
}: {
  item: any;
  puedeCancelar: boolean;
  onCancel: () => void;
}) {
  const [cancelar, { loading }] = useMutation(CANCELAR_CITA, {
    onCompleted: onCancel,
    onError: (e) => Alert.alert('Error', e.message),
  });
  const badge = estadoBadge(item.estado);
  const cancelable = item.estado === 'AGENDADA';

  function confirmCancel() {
    Alert.alert('Cancelar cita', '¿Seguro que deseas cancelar esta cita?', [
      { text: 'No' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: () => cancelar({ variables: { id: item.id } }),
      },
    ]);
  }

  const pacienteNombre = item.paciente
    ? `${item.paciente.nombre} ${item.paciente.apellido}`
    : 'Paciente';

  return (
    <Card>
      <View style={st.row}>
        <Text style={st.title}>{pacienteNombre}</Text>
        <Badge text={item.estado} bg={badge.bg} color={badge.color} />
      </View>
      <Text style={st.fecha}>{fmtFechaHora(item.fechaHora)}</Text>
      {item.especialidad ? (
        <Text style={st.meta}>Especialidad: {item.especialidad}</Text>
      ) : null}
      {item.medico?.nombre ? (
        <Text style={st.meta}>Médico: {item.medico.nombre}</Text>
      ) : null}
      {item.urgencia ? <Text style={st.meta}>Urgencia: {item.urgencia}</Text> : null}
      {item.motivo ? <Text style={st.motivo}>{item.motivo}</Text> : null}
      {cancelable && (
        <TouchableOpacity onPress={confirmCancel} disabled={loading} style={st.cancelBtn}>
          <Text style={st.cancelText}>{loading ? 'Cancelando…' : 'Cancelar cita'}</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

function NuevaCitaForm({
  esAdmin,
  medicoUid,
  onDone,
}: {
  esAdmin: boolean;
  medicoUid: string;
  onDone: () => void;
}) {
  const [paciente, setPaciente] = useState<PacienteLite | null>(null);
  const [especialidad, setEspecialidad] = useState('');
  const [fecha, setFecha] = useState(''); // YYYY-MM-DD
  const [hora, setHora] = useState(''); // HH:MM
  const [urgencia, setUrgencia] = useState<(typeof URGENCIAS)[number]>('MEDIA');
  const [motivo, setMotivo] = useState('');
  const [medicoSel, setMedicoSel] = useState<string>(''); // uid medico (admin)
  const [err, setErr] = useState<string | null>(null);

  // Solo el admin necesita elegir medico de la lista de usuarios.
  const { data: usuariosData } = useQuery<any>(USUARIOS, {
    skip: !esAdmin,
    fetchPolicy: 'cache-first',
  });
  const medicos: any[] = (usuariosData?.usuarios ?? []).filter(
    (u: any) => u.rol === 'MEDICO' && u.activo
  );

  const [crear, { loading }] = useMutation(CREAR_CITA, {
    onCompleted: () => onDone(),
    onError: (e) => setErr(e.message),
  });

  function submit() {
    setErr(null);
    if (!paciente) return setErr('Selecciona un paciente.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return setErr('Fecha inválida (usa AAAA-MM-DD).');
    if (!/^\d{2}:\d{2}$/.test(hora)) return setErr('Hora inválida (usa HH:MM).');
    const iso = new Date(`${fecha}T${hora}:00`);
    if (Number.isNaN(iso.getTime())) return setErr('Fecha/hora no válida.');
    const uidMedico = esAdmin ? medicoSel || undefined : medicoUid || undefined;
    if (esAdmin && !uidMedico) return setErr('Selecciona un médico.');

    crear({
      variables: {
        input: {
          pacienteId: paciente.id,
          medicoUid: uidMedico,
          especialidad: especialidad.trim() || null,
          fechaHora: iso.toISOString(),
          urgencia,
          motivo: motivo.trim() || null,
        },
      },
    });
  }

  return (
    <Card>
      <SectionTitle>Nueva cita</SectionTitle>
      {err && <Banner kind="error" message={err} />}
      <PacienteSearch selected={paciente} onSelect={setPaciente} onClear={() => setPaciente(null)} />

      {esAdmin && (
        <>
          <Text style={st.label}>Médico</Text>
          {medicos.length === 0 ? (
            <Text style={st.muted}>No hay médicos activos.</Text>
          ) : (
            <View style={{ marginBottom: 10 }}>
              {medicos.map((m) => (
                <TouchableOpacity
                  key={m.supabaseUid}
                  onPress={() => setMedicoSel(m.supabaseUid)}
                  style={[st.medRow, medicoSel === m.supabaseUid && st.medRowActive]}
                >
                  <Text
                    style={[st.medText, medicoSel === m.supabaseUid && st.medTextActive]}
                  >
                    {m.nombre}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}

      <Field label="Especialidad" value={especialidad} onChangeText={setEspecialidad} placeholder="Ej: Cardiología" />
      <View style={st.dateRow}>
        <View style={{ flex: 1 }}>
          <Field label="Fecha (AAAA-MM-DD)" value={fecha} onChangeText={setFecha} placeholder="2026-06-20" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ width: 12 }} />
        <View style={{ width: 110 }}>
          <Field label="Hora (HH:MM)" value={hora} onChangeText={setHora} placeholder="14:30" keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <Text style={st.label}>Urgencia</Text>
      <ChipSelect options={URGENCIAS} value={urgencia} onChange={setUrgencia} />
      <Field label="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Motivo de la consulta" multiline />
      <PrimaryButton title="Agendar cita" onPress={submit} loading={loading} />
    </Card>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 8 },
  fecha: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 6 },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  motivo: { fontSize: 13, color: COLORS.text, marginTop: 6, fontStyle: 'italic' },
  cancelBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelText: { color: COLORS.danger, fontWeight: '700', fontSize: 13 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4 },
  muted: { fontSize: 13, color: COLORS.textMuted, marginBottom: 10 },
  dateRow: { flexDirection: 'row' },
  medRow: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 6,
  },
  medRowActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  medText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  medTextActive: { color: '#fff' },
});
