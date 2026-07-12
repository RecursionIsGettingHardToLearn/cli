import 'react-native-url-polyfill/auto';
import { ethers } from 'ethers';
import { env } from './env';
import { REGISTRO_RECETAS_ABI } from './abi/registroRecetas';

/**
 * Conexion de SOLO LECTURA a Polygon Amoy desde el telefono.
 *
 * - Usa un JsonRpcProvider apuntando al RPC publico de Amoy (configurable en
 *   app.json -> expo.extra.amoyRpcUrl). NO usa ningun nodo Hardhat local.
 * - El contrato se instancia con el provider (sin signer): el movil solo
 *   verifica/lee, nunca firma transacciones ni maneja llaves privadas.
 * - Singletons perezosos: se crean en el primer uso y se reutilizan.
 *
 * ethers v6 funciona en React Native (Hermes) porque:
 *   - usa `fetch` global (disponible en RN) para el RPC,
 *   - Hermes soporta BigInt,
 *   - las llamadas `view` no necesitan crypto.getRandomValues.
 */

let _provider: ethers.JsonRpcProvider | null = null;
let _contract: ethers.Contract | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    // `staticNetwork` evita un eth_chainId extra en cada request y es mas
    // estable en moviles con red intermitente.
    const network = ethers.Network.from(env.blockchainChainId);
    _provider = new ethers.JsonRpcProvider(env.amoyRpcUrl, network, {
      staticNetwork: network,
    });
  }
  return _provider;
}

export function getContract(): ethers.Contract {
  if (!env.blockchainContractAddress || env.blockchainContractAddress.startsWith('<')) {
    throw new Error(
      'No hay address del contrato configurada. Edita app.json -> ' +
        'expo.extra.blockchainContractAddress con la address desplegada en Amoy.'
    );
  }
  if (!_contract) {
    _contract = new ethers.Contract(
      env.blockchainContractAddress,
      REGISTRO_RECETAS_ABI as unknown as ethers.InterfaceAbi,
      getProvider()
    );
  }
  return _contract;
}

/** True si hay address de contrato configurada (la verificacion on-chain puede correr). */
export function blockchainReady(): boolean {
  return Boolean(
    env.blockchainContractAddress && !env.blockchainContractAddress.startsWith('<')
  );
}

/** Metadatos utiles para mostrar en la UI ("Red: Polygon Amoy ..."). */
export const blockchainInfo = {
  rpcUrl: env.amoyRpcUrl,
  chainId: env.blockchainChainId,
  contractAddress: env.blockchainContractAddress,
  explorerUrl: env.blockchainExplorerUrl,
  networkLabel: 'Polygon Amoy (testnet)',
};
