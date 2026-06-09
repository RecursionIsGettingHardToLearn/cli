import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Linking,
} from 'react-native';
import { useLazyQuery } from '@apollo/client';
import { VERIFICAR_RECETA } from '../graphql/queries';
import { verificarHashOnChain, type ResultadoOnChain, addressUrl } from '../services/onchain';
import { blockchainInfo, blockchainReady } from '../config/blockchain';

type Modo = 'hash' | 'uuid';

/**
 * Verificador de recetas en blockchain.
 *
 * - Modo "hash" (por defecto): verifica un SHA-256 DIRECTAMENTE contra Polygon
 *   Amoy leyendo el contrato. No depende del backend; funciona desde cualquier
 *   dispositivo con internet.
 * - Modo "uuid": comodidad para verificar por UUID de receta a traves del
 *   backend GraphQL (que resuelve el hash canonico server-side). Es un fallback.
 */
export function VerificadorRecetaScreen() {
  const [modo, setModo] = useState<Modo>('hash');

  // --- on-chain directo (hash) ---
  const [hashInput, setHashInput] = useState('');
  const [onchain, setOnchain] = useState<ResultadoOnChain | null>(null);
  const [onchainLoading, setOnchainLoading] = useState(false);

  // --- via backend (uuid) ---
  const [recetaId, setRecetaId] = useState('');
  const [verificarBackend, { data, loading, error }] = useLazyQuery(VERIFICAR_RECETA, {
    fetchPolicy: 'network-only',
  });

  async function onVerificarHash() {
    const h = hashInput.trim();
    if (h.length < 64) return;
    setOnchainLoading(true);
    setOnchain(null);
    try {
      const r = await verificarHashOnChain(h);
      setOnchain(r);
    } finally {
      setOnchainLoading(false);
    }
  }

  function onVerificarUuid() {
    if (recetaId.trim().length < 36) return;
    verificarBackend({ variables: { id: recetaId.trim() } });
  }

  const resultadoBackend: any = data?.verificarReceta;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Verificar receta en blockchain</Text>
      <Text style={styles.subtitle}>
        Lectura directa del contrato en Polygon Amoy (testnet). El detalle clinico
        no vive en la cadena: solo se prueba que el documento esta registrado.
      </Text>

      {/* Selector de modo */}
      <View style={styles.tabs}>
        <TouchableOpacity
          onPress={() => setModo('hash')}
          style={[styles.tab, modo === 'hash' && styles.tabActive]}
        >
          <Text style={[styles.tabText, modo === 'hash' && styles.tabTextActive]}>Hash (on-chain)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setModo('uuid')}
          style={[styles.tab, modo === 'uuid' && styles.tabActive]}
        >
          <Text style={[styles.tabText, modo === 'uuid' && styles.tabTextActive]}>UUID (backend)</Text>
        </TouchableOpacity>
      </View>

      {modo === 'hash' ? (
        <>
          <TextInput
            value={hashInput}
            onChangeText={setHashInput}
            placeholder="SHA-256 del documento (64 hex, con o sin 0x)"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            onPress={onVerificarHash}
            disabled={onchainLoading || hashInput.trim().length < 64 || !blockchainReady()}
            style={[styles.btn, (onchainLoading || hashInput.trim().length < 64 || !blockchainReady()) && styles.btnDisabled]}
          >
            <Text style={styles.btnText}>{onchainLoading ? 'Verificando on-chain...' : 'Verificar on-chain'}</Text>
          </TouchableOpacity>

          {!blockchainReady() && (
            <Text style={styles.err}>
              ✗ Falta configurar la address del contrato (app.json → expo.extra.blockchainContractAddress).
            </Text>
          )}

          {onchainLoading && <ActivityIndicator color="#0f6e56" style={{ marginTop: 16 }} />}

          {onchain && onchain.exists && (
            <View style={styles.ok}>
              <Text style={styles.okTitle}>✓ Registrada on-chain</Text>
              <Text style={styles.okItem}>ID on-chain: {onchain.id}</Text>
              <Text style={styles.okItem}>
                Timestamp: {onchain.timestamp ? new Date(onchain.timestamp * 1000).toLocaleString() : '—'}
              </Text>
              <Text style={styles.okItem} numberOfLines={1}>Hash: {onchain.hashHex}</Text>
              <TouchableOpacity onPress={() => Linking.openURL(onchain.explorerUrl)} style={styles.txLink}>
                <Text style={styles.txText}>Ver contrato en Polygonscan ↗</Text>
              </TouchableOpacity>
            </View>
          )}

          {onchain && !onchain.exists && !onchain.error && (
            <View style={styles.warn}>
              <Text style={styles.warnTitle}>⚠ No registrada</Text>
              <Text style={styles.warnItem}>Ese hash no existe en el contrato (Amoy).</Text>
            </View>
          )}

          {onchain?.error && (
            <View style={styles.err2}>
              <Text style={styles.errTitle}>✗ Error</Text>
              <Text style={styles.errItem}>{onchain.error}</Text>
            </View>
          )}
        </>
      ) : (
        <>
          <TextInput
            value={recetaId}
            onChangeText={setRecetaId}
            placeholder="UUID de la receta (36 caracteres)"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TouchableOpacity
            onPress={onVerificarUuid}
            disabled={loading || recetaId.trim().length < 36}
            style={[styles.btn, (loading || recetaId.trim().length < 36) && styles.btnDisabled]}
          >
            <Text style={styles.btnText}>{loading ? 'Verificando...' : 'Verificar vía backend'}</Text>
          </TouchableOpacity>

          {loading && <ActivityIndicator color="#0f6e56" style={{ marginTop: 16 }} />}
          {error && <Text style={styles.err}>✗ Error: {error.message}</Text>}

          {resultadoBackend && resultadoBackend.exists === true && (
            <View style={styles.ok}>
              <Text style={styles.okTitle}>✓ Receta registrada</Text>
              <Text style={styles.okItem}>Bloque: {resultadoBackend.blockNumber ?? '—'}</Text>
              <Text style={styles.okItem}>
                Timestamp: {resultadoBackend.timestamp ? new Date(resultadoBackend.timestamp * 1000).toLocaleString() : '—'}
              </Text>
              <Text style={styles.okItem}>ID on-chain: {resultadoBackend.id}</Text>
            </View>
          )}

          {resultadoBackend && resultadoBackend.exists === false && !resultadoBackend.error && (
            <View style={styles.warn}>
              <Text style={styles.warnTitle}>⚠ No registrada</Text>
              {resultadoBackend.razon && <Text style={styles.warnItem}>{resultadoBackend.razon}</Text>}
            </View>
          )}

          {resultadoBackend?.error && (
            <View style={styles.err2}>
              <Text style={styles.errTitle}>✗ Error</Text>
              <Text style={styles.errItem}>{resultadoBackend.error}</Text>
            </View>
          )}
        </>
      )}

      {/* Pie con la red activa */}
      <TouchableOpacity onPress={() => Linking.openURL(addressUrl())} style={styles.netFooter}>
        <Text style={styles.netText}>Red: {blockchainInfo.networkLabel} · chainId {blockchainInfo.chainId}</Text>
        <Text style={styles.netTextDim} numberOfLines={1}>Contrato: {blockchainInfo.contractAddress || '(sin configurar)'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f6f8fa' },
  title: { fontSize: 20, fontWeight: '700', color: '#0f6e56', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  tabs: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 8, padding: 3, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  tabActive: { backgroundColor: 'white' },
  tabText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  tabTextActive: { color: '#0f6e56' },
  input: {
    backgroundColor: 'white', borderWidth: 1, borderColor: '#d1d5db',
    borderRadius: 6, padding: 12, fontSize: 13, fontFamily: 'monospace', minHeight: 46,
  },
  btn: { backgroundColor: '#0f6e56', borderRadius: 6, paddingVertical: 14, marginTop: 12, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: 'white', fontWeight: '600' },
  ok: { backgroundColor: '#d1fae5', padding: 16, borderRadius: 8, marginTop: 16 },
  okTitle: { color: '#065f46', fontWeight: '700', fontSize: 15 },
  okItem: { color: '#065f46', fontSize: 13, marginTop: 4 },
  warn: { backgroundColor: '#fef3c7', padding: 16, borderRadius: 8, marginTop: 16 },
  warnTitle: { color: '#92400e', fontWeight: '700', fontSize: 15 },
  warnItem: { color: '#92400e', fontSize: 13, marginTop: 4 },
  err: { color: '#a32d2d', marginTop: 12, fontSize: 13 },
  err2: { backgroundColor: '#fee2e2', padding: 16, borderRadius: 8, marginTop: 16 },
  errTitle: { color: '#991b1b', fontWeight: '700', fontSize: 15 },
  errItem: { color: '#991b1b', fontSize: 13, marginTop: 4 },
  txLink: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#a7f3d0' },
  txText: { fontSize: 12, color: '#065f46', fontWeight: '600' },
  netFooter: { marginTop: 24, padding: 12, borderRadius: 8, backgroundColor: '#eef2f7' },
  netText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  netTextDim: { fontSize: 11, color: '#6b7280', marginTop: 2 },
});
