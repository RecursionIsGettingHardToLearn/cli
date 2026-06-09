import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { registrarPushToken } from '../lib/registerPush';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function RecursosNativosScreen() {
  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Recursos nativos del telefono</Text>
      <Text style={styles.subtitle}>4 capacidades nativas integradas: camara, GPS, push, biometria.</Text>

      <CamaraSection />
      <GPSSection />
      <BiometriaSection />
      <PushSection />
    </ScrollView>
  );
}

// ============== 1) CAMARA ==============
function CamaraSection() {
  const [permission, requestPermission] = useCameraPermissions();
  const [activa, setActiva] = useState(false);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📷 Camara</Text>
      <Text style={styles.cardDesc}>Captura fotos de recetas, documentos clinicos o evidencias.</Text>

      {!permission ? (
        <Text>Cargando permisos...</Text>
      ) : !permission.granted ? (
        <TouchableOpacity onPress={requestPermission} style={styles.btn}>
          <Text style={styles.btnText}>Conceder permiso de camara</Text>
        </TouchableOpacity>
      ) : !activa ? (
        <TouchableOpacity onPress={() => setActiva(true)} style={styles.btn}>
          <Text style={styles.btnText}>Abrir camara</Text>
        </TouchableOpacity>
      ) : (
        <View>
          <CameraView style={styles.camara} facing="back" />
          <TouchableOpacity onPress={() => setActiva(false)} style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ============== 2) GPS ==============
function GPSSection() {
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  const [loading, setLoading] = useState(false);

  async function obtenerUbicacion() {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesito acceso al GPS');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords(pos.coords);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>📍 Ubicacion (GPS)</Text>
      <Text style={styles.cardDesc}>Geo-tag la sucursal de farmacia o consultorio.</Text>

      <TouchableOpacity onPress={obtenerUbicacion} disabled={loading} style={styles.btn}>
        <Text style={styles.btnText}>{loading ? 'Obteniendo...' : 'Obtener mi ubicacion'}</Text>
      </TouchableOpacity>

      {coords && (
        <View style={styles.result}>
          <Text style={styles.resultText}>Latitud:  {coords.latitude.toFixed(6)}</Text>
          <Text style={styles.resultText}>Longitud: {coords.longitude.toFixed(6)}</Text>
          <Text style={styles.resultText}>Precision: ±{coords.accuracy?.toFixed(0)} m</Text>
          {coords.altitude !== null && coords.altitude !== undefined && (
            <Text style={styles.resultText}>Altitud:  {coords.altitude.toFixed(0)} m</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ============== 3) BIOMETRIA ==============
function BiometriaSection() {
  const [resultado, setResultado] = useState<string | null>(null);

  async function autenticar() {
    const hardware = await LocalAuthentication.hasHardwareAsync();
    if (!hardware) {
      setResultado('❌ Este dispositivo no tiene hardware biometrico.');
      return;
    }
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      setResultado('❌ No tienes huella/face registrada en tu telefono.');
      return;
    }
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirma tu identidad',
      cancelLabel: 'Cancelar',
    });
    setResultado(r.success ? '✅ Autenticacion exitosa' : `❌ ${r.error ?? 'Cancelado'}`);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>🔒 Biometria (huella / Face ID)</Text>
      <Text style={styles.cardDesc}>Confirma identidad antes de operaciones criticas (firmar receta, anular factura).</Text>

      <TouchableOpacity onPress={autenticar} style={styles.btn}>
        <Text style={styles.btnText}>Autenticar con biometria</Text>
      </TouchableOpacity>

      {resultado && (
        <View style={styles.result}>
          <Text style={styles.resultText}>{resultado}</Text>
        </View>
      )}
    </View>
  );
}

// ============== 4) NOTIFICACIONES PUSH ==============
function PushSection() {
  const [token, setToken] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);

  async function registrar() {
    setRegistrando(true);
    setEstado(null);
    try {
      const res = await registrarPushToken();
      if (res.token) setToken(res.token);
      if (res.ok) {
        setEstado('Token registrado ✅');
      } else {
        setEstado(`⚠️ ${res.error ?? 'No se pudo registrar'}`);
      }
    } finally {
      setRegistrando(false);
    }
  }

  async function enviarLocal() {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Clinica',
        body: 'Tu receta ha sido registrada exitosamente en blockchain.',
        data: { tipo: 'demo' },
      },
      trigger: null,
    });
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>🔔 Notificaciones push</Text>
      <Text style={styles.cardDesc}>Alertas de recetas controladas, stock critico, citas, etc.</Text>

      <TouchableOpacity onPress={registrar} disabled={registrando} style={styles.btn}>
        <Text style={styles.btnText}>{registrando ? 'Registrando...' : 'Registrar para push'}</Text>
      </TouchableOpacity>

      {estado && (
        <View style={styles.result}>
          <Text style={styles.resultText}>{estado}</Text>
        </View>
      )}

      {token && (
        <View style={styles.result}>
          <Text style={styles.resultText} numberOfLines={3}>{token}</Text>
        </View>
      )}

      <TouchableOpacity onPress={enviarLocal} style={styles.btnSecondary}>
        <Text style={styles.btnSecondaryText}>Enviar notificacion local (demo)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f6f8fa' },
  title: { fontSize: 22, fontWeight: '700', color: '#0f6e56' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 20 },
  card: { backgroundColor: 'white', borderRadius: 8, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  btn: { backgroundColor: '#0f6e56', borderRadius: 6, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '600' },
  btnSecondary: {
    backgroundColor: 'white', borderWidth: 1, borderColor: '#0f6e56',
    borderRadius: 6, paddingVertical: 10, alignItems: 'center', marginTop: 8,
  },
  btnSecondaryText: { color: '#0f6e56', fontWeight: '600' },
  result: { backgroundColor: '#f0fdf4', padding: 12, borderRadius: 6, marginTop: 12 },
  resultText: { fontSize: 13, color: '#065f46', fontFamily: 'monospace' },
  camara: { height: 300, borderRadius: 8, overflow: 'hidden' },
});
