import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAuth } from '../auth/AuthContext';

export function HomeScreen({ navigation }: any) {
  const { user, signOut } = useAuth();

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.greeting}>Hola, {user?.nombre}</Text>
        <Text style={styles.role}>Rol: {user?.rol}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <Text style={styles.section}>Accesos rapidos</Text>

      {user?.rol === 'PACIENTE' && (
        <>
          <Tile label="Mis citas" onPress={() => navigation.navigate('Citas')} />
          <Tile label="Mis recetas" onPress={() => navigation.navigate('MisRecetas')} />
          <Tile label="Asistente IA (pre-triaje)" onPress={() => navigation.navigate('ChatTriaje')} />
          <Tile label="Reportes" onPress={() => navigation.navigate('Reportes')} />
        </>
      )}

      {user?.rol === 'MEDICO' && (
        <>
          <Tile label="Agenda de citas" onPress={() => navigation.navigate('Citas')} />
          <Tile label="Mis recetas emitidas" onPress={() => navigation.navigate('MisRecetas')} />
          <Tile label="Diagnóstico con IA (foto de estudio)" onPress={() => navigation.navigate('DiagnosticoIa')} />
          <Tile label="Verificar receta en blockchain" onPress={() => navigation.navigate('Verificador')} />
          <Tile label="Reportes" onPress={() => navigation.navigate('Reportes')} />
        </>
      )}

      {user?.rol === 'FARMACEUTICO' && (
        <>
          <Tile label="Verificar receta en blockchain" onPress={() => navigation.navigate('Verificador')} />
          <Tile label="Reportes" onPress={() => navigation.navigate('Reportes')} />
        </>
      )}

      {user?.rol === 'ADMINISTRADOR' && (
        <>
          <Tile label="Citas" onPress={() => navigation.navigate('Citas')} />
          <Tile label="Diagnóstico con IA (foto de estudio)" onPress={() => navigation.navigate('DiagnosticoIa')} />
          <Tile label="Verificar receta en blockchain" onPress={() => navigation.navigate('Verificador')} />
          <Tile label="Reportes" onPress={() => navigation.navigate('Reportes')} />
        </>
      )}

      <Text style={styles.webNote}>
        La gestión completa (inventario, caja, recepción, facturación,
        administración y dashboard BI) está disponible en la versión web.
      </Text>

      <Tile label="Recursos del telefono (camara, GPS, biometria, push)" onPress={() => navigation.navigate('RecursosNativos')} />

      <TouchableOpacity onPress={signOut} style={styles.logout}>
        <Text style={styles.logoutText}>Cerrar sesion</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Tile({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress}>
      <Text style={styles.tileText}>{label}</Text>
      <Text style={styles.tileArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f6f8fa' },
  card: { backgroundColor: 'white', borderRadius: 8, padding: 20, marginBottom: 20 },
  greeting: { fontSize: 22, fontWeight: '700', color: '#0f6e56' },
  role: { marginTop: 4, fontSize: 12, color: '#0f6e56', fontWeight: '700', letterSpacing: 1 },
  email: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  section: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10, marginLeft: 4 },
  tile: {
    backgroundColor: 'white', borderRadius: 8, padding: 16, marginBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  tileText: { fontSize: 15, color: '#1f2937', flex: 1 },
  tileArrow: { fontSize: 22, color: '#0f6e56' },
  logout: {
    marginTop: 20, padding: 14, borderRadius: 6, alignItems: 'center',
    borderWidth: 1, borderColor: '#a32d2d',
  },
  logoutText: { color: '#a32d2d', fontWeight: '600' },
  webNote: { marginTop: 14, marginHorizontal: 4, fontSize: 12, color: '#9ca3af', textAlign: 'center' },
});
