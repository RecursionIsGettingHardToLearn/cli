# ms-blockchain — Registro inmutable de recetas (Polygon Amoy)

Microservicio Node.js que expone una API REST para registrar y verificar recetas médicas en la blockchain pública de Polygon Amoy (testnet).

> El runtime apunta **siempre a Polygon Amoy**. Ya no se usa un nodo Hardhat local: Hardhat queda únicamente como toolchain para **compilar, testear y desplegar** el contrato.

## Stack

- **Node.js 18+** + Express
- **Solidity 0.8.20** + Hardhat (compilación / tests / deploy)
- **ethers.js v6** para interactuar con la red
- **Polygon Amoy** como red destino (chainId 80002)
- **Supabase JWT** (JWKS asimétrico, mismo proyecto que ms-gestion) para autorizar

## Endpoints

| Método | Ruta | Auth (rol) | Función |
|---|---|---|---|
| POST | `/recetas` | MEDICO / ADMINISTRADOR | Calcula SHA-256 del documento canónico y lo registra on-chain |
| POST | `/recetas/estimar` | MEDICO / ADMINISTRADOR | Estima el costo en POL de registrar ESE documento, sin enviarlo |
| GET  | `/recetas/gas` | Cualquier rol | Costo estimado de una receta nueva al precio de gas actual + saldo y registros restantes |
| GET  | `/recetas/verificar?hash=...` | Cualquier rol | Verifica existencia de un hash en el contrato |
| GET  | `/recetas/paciente/:id` | Cualquier rol | Devuelve índices de registros del paciente |
| GET  | `/health` | abierto | Status del servicio + red + contrato |

## Setup (Polygon Amoy testnet)

```bash
cd block_movil/ms-blockchain
npm install
npm run compile          # genera artifacts/ (ABI usado por el server y el móvil)

# Tests del contrato (red EN MEMORIA de Hardhat, no necesita red externa)
npm test
```

Configura el `.env` (ver `.env.example`):

```ini
AMOY_RPC_URL=https://rpc-amoy.polygon.technology
PRIVATE_KEY=0x...            # wallet con MATIC de testnet (faucet)
# CONTRACT_ADDRESS opcional: si lo dejas vacío, se lee de deployments/amoy.json
```

Desplegar (solo si necesitas un contrato nuevo; ya hay uno desplegado y guardado en `deployments/amoy.json`):

```bash
# 1. Consigue MATIC de testnet: https://faucet.polygon.technology
npm run deploy:amoy
# La address se imprime y se guarda en deployments/amoy.json.
# El server la toma automáticamente si CONTRACT_ADDRESS está vacío.
```

Arrancar el servicio:

```bash
npm start        # o: npm run dev  (con --watch)
```

El contrato queda visible en `https://amoy.polygonscan.com/address/<CONTRACT_ADDRESS>`.

## Estimación de costo (gas)

Antes de registrar puedes saber cuánto POL costará la transacción. La estimación
solo consulta la red (`eth_estimateGas` + `eth_getFeeData` + `eth_getBalance`):
**nunca difunde la transacción ni gasta gas**.

Las lecturas (`/recetas/verificar`, `/recetas/paciente/:id`) **no cuestan nada**;
solo `POST /recetas` (escritura) consume gas, y eso es lo que estiman estos endpoints.

```bash
# Costo representativo de una receta nueva al precio de gas actual de Amoy:
curl -s http://localhost:3001/recetas/gas | jq

# Costo exacto para un documento concreto (detecta si su hash ya está on-chain):
curl -s -X POST http://localhost:3001/recetas/estimar \
  -H 'Content-Type: application/json' \
  -d '{"documentoTexto":"...","pacienteId":"...","medicoUid":"..."}' | jq
```

Respuesta (ejemplo):

```jsonc
{
  "muestra": false,
  "yaRegistrado": false,          // true => registrar() sería idempotente, costo 0
  "hashHex": "….",                // SHA-256 del documento
  "gas": "168432",                // unidades de gas estimadas
  "gasPriceGwei": 25,             // precio actual (en Amoy domina la priority fee ~25 gwei)
  "costoEstimadoWei": "4210800000000000",
  "costoEstimadoPol": "0.0042108",// lo que costaría la transacción
  "saldoPol": "0.0965",           // saldo del firmante (PRIVATE_KEY)
  "registrosRestantesEstimados": 22, // cuántas registraciones más alcanzan a este precio
  "contractAddress": "0x…",
  "red": "Polygon Amoy (testnet)",
  "explorer": "https://amoy.polygonscan.com"
}
```

> Es testnet: cuando el saldo baje, recárgalo gratis desde un faucet de Amoy
> (https://faucet.polygon.technology). El costo real exacto de cada registro
> también queda visible en PolygonScan, en el campo *Transaction Fee* de la tx.

## Integración con el móvil

La app React Native (`block_movil/mobile-rn`) **verifica directamente on-chain contra Amoy** usando ethers.js (lectura del contrato, sin llaves privadas en el teléfono). Este microservicio sigue siendo el responsable de **escribir** (registrar) recetas controladas. Ver `mobile-rn/README.md`.

## Integración con ms-gestion

ms-gestion llama a `POST /recetas` cada vez que un médico emite una receta con un medicamento controlado (ver `RecetaService.emitir()` en ms-gestion). Si la llamada falla o expira (>5s), ms-gestion encola la receta y reintenta en background cada minuto (ver `RecetaService.reintentarBlockchainPendientes()`).

## Variables de entorno

Ver `.env.example`.
