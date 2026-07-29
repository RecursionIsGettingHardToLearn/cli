import Constants from 'expo-constants';

/**
 * Lee la configuracion desde app.json -> expo.extra.
 * Tambien tolera valores undefined para desarrollo (fallback razonable).
 *
 * BLOCKCHAIN: la verificacion on-chain se hace DIRECTAMENTE contra la
 * testnet publica de Polygon Amoy (no contra un nodo Hardhat local ni
 * obligatoriamente contra el microservicio REST). Por eso `amoyRpcUrl`,
 * `blockchainContractAddress` y `blockchainChainId` son la fuente de verdad
 * para leer el contrato desde el telefono.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  graphqlUrl?: string;
  blockchainUrl?: string;
  diagnosticosUrl?: string;
  amoyRpcUrl?: string;
  blockchainContractAddress?: string;
  blockchainChainId?: number;
  blockchainExplorerUrl?: string;
};

// Host desde el que Expo sirvio el bundle: en modo LAN es la IP de tu PC
// (la del QR), en modo --localhost es 127.0.0.1 (con tuneles adb reverse).
// Asi gateway, IA y blockchain siguen SOLOS a Metro, sin tocar IPs nunca.
// Si defines las URLs en app.json -> extra, esas mandan (override manual).
const devHost = (Constants.expoConfig?.hostUri ?? 'localhost:8081').split(':')[0];

// RPC publico de Amoy por defecto: accesible desde cualquier dispositivo con
// internet (a diferencia de localhost:8545 del viejo nodo Hardhat).
const DEFAULT_AMOY_RPC = 'https://polygon-amoy.drpc.org';
const DEFAULT_EXPLORER = 'https://amoy.polygonscan.com';
const AMOY_CHAIN_ID = 80002;

// Ingress de AKS: en un build de release no hay Metro, asi que `devHost` seria
// "localhost" y la app quedaria sin backend. Por eso fuera de __DEV__ el
// fallback apunta a la nube.
const PROD_BASE = 'https://clinica-937b0859.northcentralus.cloudapp.azure.com';

export const env = {
  supabaseUrl: extra.supabaseUrl ?? '',
  supabaseAnonKey: extra.supabaseAnonKey ?? '',
  // En cli el gateway GraphQL es el BFF de Next.js (ms-pacientes, :3000)
  graphqlUrl:
    extra.graphqlUrl ??
    (__DEV__ ? `http://${devHost}:3000/api/graphql` : `${PROD_BASE}/api/graphql`),
  // REST del microservicio (opcional: solo se usa como fallback de UUID).
  blockchainUrl: extra.blockchainUrl ?? (__DEV__ ? `http://${devHost}:3001` : `${PROD_BASE}/blockchain`),
  diagnosticosUrl: extra.diagnosticosUrl ?? (__DEV__ ? `http://${devHost}:8000` : `${PROD_BASE}/ia`),

  // === Blockchain on-chain directo (Polygon Amoy testnet) ===
  amoyRpcUrl: extra.amoyRpcUrl ?? DEFAULT_AMOY_RPC,
  blockchainContractAddress: extra.blockchainContractAddress ?? '',
  blockchainChainId: extra.blockchainChainId ?? AMOY_CHAIN_ID,
  blockchainExplorerUrl: extra.blockchainExplorerUrl ?? DEFAULT_EXPLORER,
};

export function assertEnvReady() {
  const missing: string[] = [];
  if (!env.supabaseUrl || env.supabaseUrl.startsWith('<')) missing.push('supabaseUrl');
  if (!env.supabaseAnonKey || env.supabaseAnonKey.startsWith('<')) missing.push('supabaseAnonKey');
  if (missing.length > 0) {
    console.warn(
      '[env] Configuracion incompleta. Edita app.json -> expo.extra: faltan ' +
        missing.join(', ')
    );
  }
  if (!env.blockchainContractAddress || env.blockchainContractAddress.startsWith('<')) {
    console.warn(
      '[env] blockchainContractAddress vacio en app.json -> expo.extra. ' +
        'La verificacion on-chain directa no funcionara hasta poblarlo con la ' +
        'address desplegada en Amoy (ver ms-blockchain/deployments/amoy.json).'
    );
  }
}
