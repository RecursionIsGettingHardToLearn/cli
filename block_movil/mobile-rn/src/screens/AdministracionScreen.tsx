import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useQuery, useMutation } from '@apollo/client';
import { usePaginacion, PiePaginacion } from '../ui/paginacion';
import {
  USUARIOS,
  CREAR_USUARIO,
  CAMBIAR_ROL_USUARIO,
  ACTIVAR_USUARIO,
  DESACTIVAR_USUARIO,
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
} from '../ui/kit';

const ROLES = ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'] as const;
type Rol = (typeof ROLES)[number];

interface Usuario {
  id: string;
  supabaseUid: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}

export function AdministracionScreen() {
  const { data, loading, error, refetch } = useQuery<any>(USUARIOS, {
    fetchPolicy: 'cache-and-network',
  });
  const [creating, setCreating] = useState(false);

  const usuarios: Usuario[] = data?.usuarios ?? [];
  const pag = usePaginacion(usuarios, 15);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error.message} />;


  if (creating) {
    return (
      <Screen>
        <CrearUsuarioForm
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
        data={pag.items}
        onEndReached={pag.cargarMas}
        onEndReachedThreshold={0.4}
        ListFooterComponent={<PiePaginacion {...pag.pie} />}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            <OutlineButton title="+ Crear usuario" onPress={() => setCreating(true)} />
            <SectionTitle>Usuarios ({usuarios.length})</SectionTitle>
          </View>
        }
        ListEmptyComponent={<EmptyState message="No hay usuarios." />}
        renderItem={({ item }) => <UsuarioCard u={item} onChanged={() => refetch()} />}
      />
    </Screen>
  );
}

function UsuarioCard({ u, onChanged }: { u: Usuario; onChanged: () => void }) {
  const [cambiarRol, { loading: lr }] = useMutation(CAMBIAR_ROL_USUARIO, {
    onCompleted: onChanged,
    onError: (e) => Alert.alert('Error', e.message),
  });
  const [activar, { loading: la }] = useMutation(ACTIVAR_USUARIO, {
    onCompleted: onChanged,
    onError: (e) => Alert.alert('Error', e.message),
  });
  const [desactivar, { loading: ld }] = useMutation(DESACTIVAR_USUARIO, {
    onCompleted: onChanged,
    onError: (e) => Alert.alert('Error', e.message),
  });
  const [expand, setExpand] = useState(false);

  return (
    <Card>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{u.nombre}</Text>
          <Text style={s.meta}>{u.email}</Text>
        </View>
        <Badge
          text={u.activo ? u.rol : `${u.rol} · inactivo`}
          bg={u.activo ? COLORS.infoBg : COLORS.dangerBg}
          color={u.activo ? COLORS.info : COLORS.danger}
        />
      </View>

      <TouchableOpacity onPress={() => setExpand((v) => !v)} style={{ marginTop: 8 }}>
        <Text style={s.toggle}>{expand ? 'Ocultar acciones' : 'Gestionar ›'}</Text>
      </TouchableOpacity>

      {expand && (
        <View style={{ marginTop: 8 }}>
          <Text style={s.label}>Cambiar rol</Text>
          <ChipSelect
            options={ROLES}
            value={u.rol}
            onChange={(r) => {
              if (r !== u.rol) cambiarRol({ variables: { id: u.id, rol: r } });
            }}
          />
          {(lr || la || ld) && <Text style={s.meta}>Aplicando…</Text>}
          {u.activo ? (
            <OutlineButton
              title="Desactivar usuario"
              color={COLORS.danger}
              onPress={() =>
                Alert.alert('Desactivar', `¿Desactivar a ${u.nombre}?`, [
                  { text: 'No' },
                  {
                    text: 'Sí',
                    style: 'destructive',
                    onPress: () => desactivar({ variables: { id: u.id } }),
                  },
                ])
              }
            />
          ) : (
            <OutlineButton
              title="Reactivar usuario"
              onPress={() => activar({ variables: { id: u.id } })}
            />
          )}
        </View>
      )}
    </Card>
  );
}

function CrearUsuarioForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol>('MEDICO');
  // Campos clinicos extra (solo aplican si el rol es PACIENTE).
  const [ci, setCi] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const [crear, { loading }] = useMutation(CREAR_USUARIO, {
    onCompleted: onDone,
    onError: (e) => setErr(e.message),
  });

  const esPaciente = rol === 'PACIENTE';

  function submit() {
    setErr(null);
    if (!nombre.trim() || !email.trim() || !password.trim()) {
      return setErr('Nombre, email y contraseña son obligatorios.');
    }
    if (password.length < 6) return setErr('La contraseña debe tener al menos 6 caracteres.');
    if (esPaciente && (!ci.trim() || !apellido.trim())) {
      return setErr('Para PACIENTE, CI y apellido son obligatorios.');
    }
    crear({
      variables: {
        nombre: nombre.trim(),
        email: email.trim(),
        password,
        rol,
        ci: esPaciente ? ci.trim() : null,
        apellido: esPaciente ? apellido.trim() : null,
        telefono: esPaciente ? telefono.trim() || null : null,
        fechaNacimiento: null,
      },
    });
  }

  return (
    <Card>
      <SectionTitle>Crear usuario</SectionTitle>
      {err && <Banner kind="error" message={err} />}
      <Field label="Nombre *" value={nombre} onChangeText={setNombre} />
      <Field label="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Contraseña *" value={password} onChangeText={setPassword} secureTextEntry />
      <Text style={s.label}>Rol</Text>
      <ChipSelect options={ROLES} value={rol} onChange={setRol} />
      {esPaciente && (
        <>
          <Banner kind="warn" message="Al crear un PACIENTE también se crea su ficha clínica." />
          <Field label="CI *" value={ci} onChangeText={setCi} keyboardType="numbers-and-punctuation" />
          <Field label="Apellido *" value={apellido} onChangeText={setApellido} />
          <Field label="Teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />
        </>
      )}
      <PrimaryButton title="Crear usuario" onPress={submit} loading={loading} />
      <View style={{ height: 8 }} />
      <OutlineButton title="Cancelar" onPress={onCancel} color={COLORS.textMuted} />
    </Card>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  toggle: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4 },
});
