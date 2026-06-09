import { ethers } from 'ethers';
import { getContract, blockchainInfo } from '../config/blockchain';

/**
 * Servicio de verificacion ON-CHAIN DIRECTA contra Polygon Amoy.
 *
 * Reemplaza la dependencia del backend GraphQL/REST para verificar: el telefono
 * llama al contrato `RegistroRecetas.verificar(bytes32)` directamente sobre la
 * testnet publica de Amoy. Si el backend esta caido, esto sigue funcionando.
 */

export interface ResultadoOnChain {
  exists: boolean;
  id: number | null;
  timestamp: number | null; // segundos epoch (block.timestamp)
  hashHex: string; // hash normalizado sin 0x
  contractAddress: string;
  explorerUrl: string; // link a la address del contrato en el explorer
  error?: string;
}

/** Normaliza un SHA-256 hex (con o sin 0x) a 64 chars en minuscula, sin prefijo. */
export function normalizeHash(input: string): string {
  let h = (input || '').trim();
  if (h.startsWith('0x') || h.startsWith('0X')) h = h.slice(2);
  if (!/^[0-9a-fA-F]{64}$/.test(h)) {
    throw new Error(
      `hash invalido: se esperaba SHA-256 hex de 64 caracteres, recibi "${input}" (len=${(input || '').length})`
    );
  }
  return h.toLowerCase();
}

/**
 * Empaqueta un identificador (UUID de paciente, etc.) a bytes32 con la MISMA
 * logica que el microservicio (`hashService.toBytes32`): si ya es hex de 32
 * bytes se usa tal cual; si no, se hace keccak256 del string (`ethers.id`).
 */
export function toBytes32(input: string): string {
  if (!input) return ethers.ZeroHash;
  const s = String(input).trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return s;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return '0x' + s;
  return ethers.id(s);
}

/** Link al explorer para una transaccion. */
export function txUrl(txHash: string): string {
  return `${blockchainInfo.explorerUrl}/tx/${txHash}`;
}

/** Link al explorer para una address (por defecto, el contrato). */
export function addressUrl(address?: string): string {
  return `${blockchainInfo.explorerUrl}/address/${address ?? blockchainInfo.contractAddress}`;
}

/**
 * Verifica un hash SHA-256 directamente en la cadena (Amoy).
 * Nunca lanza: devuelve `{ exists:false, error }` ante cualquier fallo para que
 * la UI lo muestre de forma explicita.
 */
export async function verificarHashOnChain(hashHex: string): Promise<ResultadoOnChain> {
  const base = {
    contractAddress: blockchainInfo.contractAddress,
    explorerUrl: addressUrl(),
  };
  let normalized: string;
  try {
    normalized = normalizeHash(hashHex);
  } catch (e: any) {
    return { exists: false, id: null, timestamp: null, hashHex: String(hashHex ?? ''), error: e?.message ?? String(e), ...base };
  }

  try {
    const contract = getContract();
    const result = await contract.verificar('0x' + normalized);
    // ethers v6 devuelve un Result tipo array + named.
    const exists = Boolean(result[0]);
    const id = Number(result[1]);
    const timestamp = Number(result[2]);
    return {
      exists,
      id: exists ? id : null,
      timestamp: exists ? timestamp : null,
      hashHex: normalized,
      ...base,
    };
  } catch (e: any) {
    return {
      exists: false,
      id: null,
      timestamp: null,
      hashHex: normalized,
      error: e?.shortMessage || e?.message || String(e),
      ...base,
    };
  }
}

/**
 * Devuelve los indices on-chain de las recetas de un paciente (lectura directa).
 * Util para auditoria; el detalle clinico no vive en la cadena.
 */
export async function recetasDePacienteOnChain(pacienteId: string): Promise<number[]> {
  const contract = getContract();
  const indices: bigint[] = await contract.recetasDe(toBytes32(pacienteId));
  return indices.map((i) => Number(i));
}
