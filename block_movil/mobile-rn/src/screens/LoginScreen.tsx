import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth/AuthContext';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  async function onSubmit() {
    if (!email || !password) {
      Alert.alert('Faltan datos', 'Email y contraseña son obligatorios');
      return;
    }
    setLoading(true);
    const res = await signIn(email.trim(), password);
    setLoading(false);
    if (!res.ok) Alert.alert('Error', res.error ?? 'Credenciales invalidas');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.wrap}
    >
      <StatusBar style="light" />
      <View style={styles.card}>
        <Text style={styles.title}>Clinica</Text>
        <Text style={styles.subtitle}>Inicia sesion para continuar</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ejemplo@clinica.com"
          style={styles.input}
        />

        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="********"
          style={styles.input}
        />

        <TouchableOpacity
          onPress={onSubmit}
          disabled={loading}
          style={[styles.btn, loading && styles.btnDisabled]}
        >
          <Text style={styles.btnText}>{loading ? 'Ingresando...' : 'Iniciar sesion'}</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Usa la cuenta Supabase que tu administrador haya creado.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f6e56', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 28 },
  title: { fontSize: 28, fontWeight: '700', color: '#0f6e56', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '500', color: '#374151', marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6,
    padding: 12, marginTop: 6, fontSize: 14,
  },
  btn: {
    backgroundColor: '#0f6e56', borderRadius: 6, paddingVertical: 14,
    marginTop: 20, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: 'white', fontWeight: '600', fontSize: 15 },
  hint: { marginTop: 16, fontSize: 12, color: '#6b7280', textAlign: 'center' },
});
