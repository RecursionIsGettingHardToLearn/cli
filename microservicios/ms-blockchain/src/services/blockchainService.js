const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { sha256Hex, toBytes32 } = require('./hashService');

const ABI_PATH = path.join(__dirname, '..', '..', 'artifacts', 'contracts', 'RegistroRecetas.sol', 'RegistroRecetas.json');
const AMOY_DEPLOYMENT_PATH = path.join(__dirname, '..', '..', 'deployments', 'amoy.json');

// RPC publico de Polygon Amoy por defecto. Ya NO usamos un nodo Hardhat local:
// el microservicio habla siempre con la testnet publica salvo que se sobreescriba
// AMOY_RPC_URL en el .env.
const DEFAULT_AMOY_RPC = 'https://rpc-amoy.polygon.technology';

/**
 * Lee la address del contrato desplegado en Amoy desde deployments/amoy.json.
 * Permite arrancar el server sin definir CONTRACT_ADDRESS manualmente: tras un
 * `npm run deploy:amoy` el archivo queda actualizado y este fallback lo toma.
 */
function contractAddressFromDeployment() {
  try {
    if (fs.existsSync(AMOY_DEPLOYMENT_PATH)) {
      const dep = JSON.parse(fs.readFileSync(AMOY_DEPLOYMENT_PATH, 'utf8'));
      return dep.address || null;
    }
  } catch (e) {
    console.warn(`No se pudo leer ${AMOY_DEPLOYMENT_PATH}: ${e.message}`);
  }
  return null;
}

class BlockchainService {
  constructor() {
    // Cola de transacciones para serializar nonces y evitar NONCE_EXPIRED
    // cuando llegan multiples POST /recetas en paralelo o muy seguidas.
    this._txQueue = Promise.resolve();

    const rpcUrl = process.env.AMOY_RPC_URL || process.env.RPC_URL || DEFAULT_AMOY_RPC;
    const privateKey = process.env.PRIVATE_KEY;
    // CONTRACT_ADDRESS del .env tiene prioridad; si no, usamos la del ultimo
    // deploy guardado en deployments/amoy.json.
    const contractAddress = process.env.CONTRACT_ADDRESS || contractAddressFromDeployment();

    if (!contractAddress) {
      console.warn('CONTRACT_ADDRESS no definido — los endpoints de escritura fallaran');
    }
    if (!privateKey) {
      console.warn('PRIVATE_KEY no definido — los endpoints de escritura fallaran');
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = privateKey ? new ethers.Wallet(privateKey, this.provider) : null;
    this.contractAddress = contractAddress;
    this.rpcUrl = rpcUrl;

    const artifact = fs.existsSync(ABI_PATH) ? JSON.parse(fs.readFileSync(ABI_PATH, 'utf8')) : null;
    if (!artifact) {
      console.warn('Artifact del contrato no encontrado — ejecuta `npx hardhat compile`');
    }
    this.abi = artifact ? artifact.abi : [];

    this.contract = contractAddress && this.abi.length > 0
      ? new ethers.Contract(contractAddress, this.abi, this.signer ?? this.provider)
      : null;
  }

  ready() {
    return Boolean(this.contract);
  }

  /**
   * Registra un documento canonico (string) en el contrato.
   * Devuelve { id, txHash, blockNumber, hash }.
   *
   * Las transacciones se encolan (mutex via Promise chain) para que cada una
   * obtenga su nonce solo cuando la anterior haya sido enviada+minada — evita
   * NONCE_EXPIRED en rafagas (ej. emitir 3 recetas en 1 segundo).
   */
  async registrar(documentoTexto, pacienteId, medicoUid) {
    if (!this.contract || !this.signer) throw new Error('Blockchain no listo: faltan CONTRACT_ADDRESS o PRIVATE_KEY');

    const ejecutar = async () => {
      const hashHex = sha256Hex(documentoTexto);
      const hashBytes32 = '0x' + hashHex;
      const pacienteBytes32 = toBytes32(pacienteId, ethers);
      const medicoBytes32 = toBytes32(medicoUid, ethers);

      // Idempotencia: si el hash YA esta en cadena (de un intento anterior cuyo
      // ack se perdio), devolvemos los datos existentes sin gastar gas. Ademas
      // buscamos el evento RecetaRegistrada original para recuperar txHash y bloque.
      try {
        const [exists, existingId] = await this.contract.verificar(hashBytes32);
        if (exists) {
          console.log(`[registrar] hash ${hashHex} ya estaba registrado on-chain (id=${existingId}) — buscando tx original`);
          const origTx = await this._findOriginalTx(hashBytes32);
          return {
            hashHex,
            receipt: null,
            existingId: Number(existingId),
            originalTxHash: origTx?.txHash || null,
            originalBlockNumber: origTx?.blockNumber || null
          };
        }
      } catch (e) {
        // Si el verificar falla, intentamos el registrar igual
        console.warn(`[registrar] verificar previo fallo (no es bloqueante): ${e.message}`);
      }

      // Nonce explicito desde la red (latest) para no depender del cache de ethers
      const nonce = await this.provider.getTransactionCount(await this.signer.getAddress(), 'latest');
      const tx = await this.contract.registrar(hashBytes32, pacienteBytes32, medicoBytes32, { nonce });
      const receipt = await tx.wait(1);
      return { hashHex, receipt };
    };

    // Encolamos la ejecucion: la siguiente solo arranca cuando esta termine.
    const next = this._txQueue.then(ejecutar, ejecutar);
    // Mantenemos la cola viva aunque esta tx falle, sin propagar el error a la siguiente.
    this._txQueue = next.catch(() => {});
    const { hashHex, receipt, existingId, originalTxHash, originalBlockNumber } = await next;

    // Caso idempotente: ya estaba registrado, devolvemos tx original si la encontramos
    if (receipt == null && existingId != null) {
      return {
        id: existingId,
        txHash: originalTxHash || null,
        blockNumber: originalBlockNumber || null,
        hash: hashHex,
        alreadyRegistered: true
      };
    }

    // Extraer id del evento RecetaRegistrada
    let registeredId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed && parsed.name === 'RecetaRegistrada') {
          registeredId = Number(parsed.args[0]);
          break;
        }
      } catch (_) { /* otro log */ }
    }

    return {
      id: registeredId,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      hash: hashHex
    };
  }

  async verificarPorHash(hashHex) {
    if (!this.contract) throw new Error('Blockchain no listo (faltan CONTRACT_ADDRESS o ABI)');
    if (!hashHex || typeof hashHex !== 'string') {
      throw new Error(`hash inválido: ${JSON.stringify(hashHex)}`);
    }
    let normalized = hashHex.trim();
    if (normalized.startsWith('0x')) normalized = normalized.slice(2);
    if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
      throw new Error(`hash debe ser SHA-256 hex de 64 chars, recibí "${hashHex}" (len=${hashHex.length})`);
    }
    const hashBytes32 = '0x' + normalized;
    try {
      const result = await this.contract.verificar(hashBytes32);
      // ethers v6 devuelve un Result tipo array+named
      const exists = Boolean(result[0]);
      const id = Number(result[1]);
      const timestamp = Number(result[2]);
      return { exists, id, timestamp };
    } catch (e) {
      // Si el contrato no responde, dar contexto util
      console.error('contract.verificar falló:', { hashBytes32, error: e.message, code: e.code, info: e.info });
      throw new Error(`contract.verificar(${hashBytes32}) falló: ${e.shortMessage || e.message}`);
    }
  }

  async recetasDe(pacienteId) {
    if (!this.contract) throw new Error('Blockchain no listo');
    const pacienteBytes32 = toBytes32(pacienteId, ethers);
    const indices = await this.contract.recetasDe(pacienteBytes32);
    return indices.map(i => Number(i));
  }

  /**
   * Estima el costo en POL de registrar una receta SIN enviar la transaccion.
   *
   *  - Si se pasa documentoTexto/pacienteId/medicoUid, estima para ESE documento
   *    real. Ademas, si su hash YA esta on-chain, lo reporta (yaRegistrado=true)
   *    y devuelve costo 0, porque registrar() es idempotente y no gastaria gas.
   *  - Si no se pasan datos, usa valores de muestra aleatorios para devolver un
   *    costo representativo de una receta NUEVA (mismo gasto, todos los SSTORE
   *    en frio).
   *
   * Solo consulta la red (eth_estimateGas + eth_getFeeData + eth_getBalance);
   * NUNCA difunde la transaccion ni gasta gas.
   *
   * Devuelve:
   *   { muestra, yaRegistrado, id?, hashHex, gas, gasPriceGwei,
   *     costoEstimadoWei, costoEstimadoPol, saldoPol,
   *     registrosRestantesEstimados, contractAddress, rpcUrl, signer, red, explorer }
   */
  async estimarGasRegistro({ documentoTexto, pacienteId, medicoUid } = {}) {
    if (!this.contract) throw new Error('Blockchain no listo: falta CONTRACT_ADDRESS o ABI');

    const esMuestra = !documentoTexto;
    let hashHex, hashBytes32, pacienteBytes32, medicoBytes32;

    if (esMuestra) {
      // Hash aleatorio => no existe en cadena => la estimacion refleja el costo
      // de una receta nueva (require de anti-duplicado pasa y se escriben todos
      // los slots en frio).
      hashBytes32 = ethers.hexlify(ethers.randomBytes(32));
      hashHex = hashBytes32.slice(2);
      pacienteBytes32 = ethers.hexlify(ethers.randomBytes(32));
      medicoBytes32 = ethers.hexlify(ethers.randomBytes(32));
    } else {
      hashHex = sha256Hex(documentoTexto);
      hashBytes32 = '0x' + hashHex;
      pacienteBytes32 = toBytes32(pacienteId, ethers);
      medicoBytes32 = toBytes32(medicoUid, ethers);
    }

    // Direccion que firmaria (para 'from' de la estimacion y para el saldo).
    const from = this.signer ? await this.signer.getAddress() : null;

    // Documento real ya registrado => registrar() seria idempotente (0 gas).
    if (!esMuestra) {
      try {
        const [exists, existingId] = await this.contract.verificar(hashBytes32);
        if (exists) {
          const saldo = await this._saldoPol(from);
          return {
            muestra: false,
            yaRegistrado: true,
            id: Number(existingId),
            hashHex,
            gas: '0',
            gasPriceGwei: null,
            costoEstimadoWei: '0',
            costoEstimadoPol: '0',
            saldoPol: saldo.pol,
            registrosRestantesEstimados: null,
            ...this._meta(from)
          };
        }
      } catch (_) {
        // Si verificar falla, seguimos con la estimacion normal.
      }
    }

    // 1) Unidades de gas (simulacion eth_estimateGas; no difunde).
    const overrides = from ? { from } : {};
    const gas = await this.contract.registrar.estimateGas(
      hashBytes32, pacienteBytes32, medicoBytes32, overrides
    );

    // 2) Precio de gas actual de la red (EIP-1559). En Amoy la base fee es ~0 y
    //    domina la priority fee (minimo ~25 gwei), por lo que maxFeePerGas es un
    //    techo realista de lo que se paga. Caemos a gasPrice legacy si hiciera falta.
    const fee = await this.provider.getFeeData();
    const precioWei = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;

    const costoWei = gas * precioWei;

    // 3) Saldo del firmante y cuantas registraciones mas alcanzan a este precio.
    const saldo = await this._saldoPol(from);
    let registrosRestantes = null;
    if (saldo.wei != null && costoWei > 0n) {
      registrosRestantes = Number(saldo.wei / costoWei);
    }

    return {
      muestra: esMuestra,
      yaRegistrado: false,
      hashHex,
      gas: gas.toString(),
      gasPriceGwei: Number(ethers.formatUnits(precioWei, 'gwei')),
      costoEstimadoWei: costoWei.toString(),
      costoEstimadoPol: ethers.formatEther(costoWei),
      saldoPol: saldo.pol,
      registrosRestantesEstimados: registrosRestantes,
      ...this._meta(from)
    };
  }

  /** Saldo nativo (POL) de una address. Devuelve { wei, pol } o nulos. */
  async _saldoPol(address) {
    if (!address) return { wei: null, pol: null };
    try {
      const wei = await this.provider.getBalance(address);
      return { wei, pol: ethers.formatEther(wei) };
    } catch (_) {
      return { wei: null, pol: null };
    }
  }

  /** Metadatos de red/contrato sin coste de RPC. */
  _meta(from) {
    return {
      contractAddress: this.contractAddress,
      rpcUrl: this.rpcUrl,
      signer: from,
      red: 'Polygon Amoy (testnet)',
      explorer: 'https://amoy.polygonscan.com'
    };
  }

  /**
   * Busca el evento RecetaRegistrada con un hashDoc especifico para recuperar
   * el txHash original. Util cuando una tx se confirmo pero la respuesta a Java
   * se perdio (ej. reinicio del server). Solo escanea los ultimos 50_000 bloques
   * para no abusar del RPC publico.
   */
  async _findOriginalTx(hashBytes32) {
    // El RPC publico de Amoy limita el rango de eth_getLogs (~1000 bloques).
    // Escaneamos en ventanas pequenas hacia atras hasta encontrar el evento o
    // agotar el limite. Como el ack solo se pierde por reinicios recientes, la
    // tx suele estar a pocos miles de bloques.
    const CHUNK = 1000;        // bloques por consulta (seguro para RPC publico)
    const MAX_CHUNKS = 12;     // ~12k bloques (~6-7h de historia en Amoy)
    try {
      const latest = await this.provider.getBlockNumber();
      const filter = this.contract.filters.RecetaRegistrada(null, hashBytes32);
      for (let i = 0; i < MAX_CHUNKS; i++) {
        const toBlock = latest - i * CHUNK;
        const fromBlock = Math.max(0, toBlock - CHUNK + 1);
        try {
          const events = await this.contract.queryFilter(filter, fromBlock, toBlock);
          if (events.length > 0) {
            const ev = events[0];
            console.log(`[_findOriginalTx] evento encontrado: tx=${ev.transactionHash} bloque=${ev.blockNumber}`);
            return { txHash: ev.transactionHash, blockNumber: ev.blockNumber };
          }
        } catch (inner) {
          console.warn(`[_findOriginalTx] chunk [${fromBlock}-${toBlock}] fallo: ${inner.message}`);
        }
        if (fromBlock === 0) break;
      }
      console.warn(`[_findOriginalTx] no se encontro evento para hash en ${MAX_CHUNKS * CHUNK} bloques`);
      return null;
    } catch (e) {
      console.warn(`[_findOriginalTx] busqueda fallo: ${e.message}`);
      return null;
    }
  }

  async networkInfo() {
    const net = await this.provider.getNetwork();
    return {
      chainId: Number(net.chainId),
      name: net.name,
      rpcUrl: this.rpcUrl,
      contract: this.contractAddress,
      signer: this.signer ? await this.signer.getAddress() : null
    };
  }
}

module.exports = new BlockchainService();
