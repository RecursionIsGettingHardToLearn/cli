# mobile-rn — App móvil (Expo / React Native)

App móvil del sistema clínica, consume el mismo backend GraphQL que el web Angular y reutiliza el login de Supabase. Cubre los **3 recursos nativos** que pide el parcial 2 + **biometría** como bonus.

## Stack

- **Expo SDK 56** (managed workflow — no necesitas Android Studio ni Xcode)
- **React Native 0.85** + React 19
- **TypeScript**
- **React Navigation 7** (Drawer + Native Stack)
- **Apollo Client** + Supabase JS
- **expo-camera**, **expo-location**, **expo-notifications**, **expo-local-authentication**

## Cómo probarlo en tu celular en 5 minutos (sin emulador)

1. **Instala Expo Go** en tu celular desde la Play Store / App Store.
2. **Conecta el celular a la misma WiFi** que tu PC.
3. **Configura** `app.json` (esperar paso de "Configuración" abajo).
4. En la PC:
   ```powershell
   cd apps\mobile-rn
   npm install
   # Si hay mismatch de versiones tras el install:
   npx expo install --fix
   npm start
   ```
5. Cuando arranque, verás un QR en la terminal. **Escanéalo con Expo Go** (Android) o con la cámara (iPhone → abre Expo Go).
6. La app se descarga y se abre. Login con tus credenciales Supabase.

## Configuración

Edita `app.json` → `expo.extra`:

```json
"extra": {
  "supabaseUrl": "https://<tu-proyecto>.supabase.co",
  "supabaseAnonKey": "sb_publishable_...",
  "graphqlUrl": "http://<IP_DE_TU_PC_EN_LAN>:8080/graphql",
  "blockchainUrl": "http://<IP_DE_TU_PC_EN_LAN>:3001",
  "amoyRpcUrl": "https://rpc-amoy.polygon.technology",
  "blockchainContractAddress": "0xBa43Cc53c22851505179e0163A24E77681374805",
  "blockchainChainId": 80002,
  "blockchainExplorerUrl": "https://amoy.polygonscan.com"
}
```

> **Nota sobre el blockchain**: `graphqlUrl`/`blockchainUrl` requieren la IP LAN de tu PC, pero la **verificación on-chain** usa `amoyRpcUrl` (RPC público de Amoy) y funciona desde **cualquier** dispositivo con internet, sin depender de tu PC ni de un nodo local. `blockchainContractAddress` debe ser la address desplegada en Amoy (ver `ms-blockchain/deployments/amoy.json`).

**IMPORTANTE — IP de la PC, no `localhost`**: el celular no puede resolver `localhost` (apunta a sí mismo). Necesitas la IP LAN de tu PC. Para averiguarla:
```powershell
ipconfig | findstr IPv4
# Ejemplo de salida:    IPv4. . . . . . . . . . : 192.168.64.97
```

Y en Spring Boot (`services/ms-gestion/src/main/resources/application.yml`) ya está configurado para aceptar CORS desde `192.168.*:4200` y `:8080`.

> Si no quieres complicarte con IPs, usa `npm start` que arranca con `--tunnel` y crea un túnel público vía ngrok. Más lento pero funciona desde cualquier red.

## Pantallas

| Pantalla | Rol | Funcionalidad |
|---|---|---|
| `LoginScreen` | (sin sesión) | Email + password contra Supabase |
| `HomeScreen` | todos | Tiles de acceso rápido filtrados por rol |
| `MisRecetasScreen` | MEDICO / PACIENTE | Lista de recetas con badges On-chain + link a Polygonscan |
| `MisFacturasScreen` | PACIENTE | Historial de facturas con detalles |
| `VerificadorRecetaScreen` | ADMIN / MEDICO / FARMA | Verifica on-chain por **hash** (lectura directa de Amoy) o por **UUID** (vía backend) |
| `RecursosNativosScreen` | todos | Demo de cámara + GPS + push + biometría |

## Recursos nativos integrados (cumple requisito del parcial)

1. **Cámara** — `expo-camera`: captura fotos de recetas/documentos.
2. **GPS** — `expo-location`: geolocaliza la sucursal.
3. **Push notifications** — `expo-notifications`: alertas de stock crítico, recetas controladas, etc.
4. **Biometría** — `expo-local-authentication`: confirmación huella/Face ID antes de operaciones críticas (bonus).

Todos están en la pantalla **Recursos del teléfono** disponible para los 4 roles.

## Estructura

```
src/
├── auth/AuthContext.tsx           Provider que escucha session Supabase
├── config/
│   ├── env.ts                     Lee app.json -> expo.extra (incluye config Amoy)
│   ├── supabase.ts                Cliente Supabase con AsyncStorage + processLock
│   ├── apollo.ts                  Cliente GraphQL con setContext que inyecta JWT
│   ├── blockchain.ts              Provider + contrato (solo lectura) hacia Polygon Amoy
│   └── abi/registroRecetas.ts     ABI de lectura del contrato RegistroRecetas
├── services/onchain.ts            Verificación on-chain directa (verificarHashOnChain)
├── graphql/queries.ts             Queries y mutations
├── navigation/AppNavigator.tsx    Stack (login vs app) + Drawer filtrado por rol
└── screens/
    ├── LoginScreen.tsx
    ├── HomeScreen.tsx
    ├── MisRecetasScreen.tsx
    ├── MisFacturasScreen.tsx
    ├── VerificadorRecetaScreen.tsx
    └── RecursosNativosScreen.tsx
```

## Blockchain (Polygon Amoy) — verificación on-chain directa

La verificación de recetas se hace **directamente contra Polygon Amoy (testnet)** desde el teléfono con `ethers.js`, leyendo el contrato `RegistroRecetas`. Ya **no** se usa un nodo Hardhat local ni se depende del backend para verificar.

- **Solo lectura**: el móvil nunca firma transacciones ni guarda llaves privadas. Registrar recetas (escritura) sigue siendo responsabilidad del microservicio `ms-blockchain`.
- **Funciona desde cualquier red**: el RPC público de Amoy es accesible por internet (a diferencia de `localhost:8545`).
- **`VerificadorRecetaScreen`** permite verificar por hash SHA-256 (on-chain directo) o por UUID (vía backend, como comodidad).
- **`MisRecetasScreen`** añade un botón "Verificar on-chain (Amoy)" por receta que comprueba el `hashDocumento` contra el contrato y enlaza al explorer.

Config relevante en `app.json → expo.extra`: `amoyRpcUrl`, `blockchainContractAddress`, `blockchainChainId`, `blockchainExplorerUrl`.

## Comandos

```powershell
npm install                         # primera vez
npx expo install --fix              # si hay mismatch de versiones de paquetes Expo
npm start                           # con tunnel (recomendado)
npm run start:lan                   # solo LAN (más rápido si estás en la misma WiFi)
npm run android                     # si tienes emulador o ADB conectado
npm run ios                         # solo en Mac
npm run web                         # versión web (limitada — los recursos nativos no funcionan)
```

## Troubleshooting

| Problema | Solución |
|---|---|
| Expo Go dice "Network response timed out" | Verifica que `graphqlUrl` en `app.json` use IP LAN (no `localhost`). Verifica firewall de Windows: `New-NetFirewallRule -DisplayName "Clinica-Dev" -Direction Inbound -LocalPort 4200,8080,3001 -Protocol TCP -Action Allow` |
| `Cannot find module 'react-native-url-polyfill'` | Falta dep: `npx expo install react-native-url-polyfill` |
| Mismatch de versiones tras `npm install` | `npx expo install --fix` |
| Cámara no abre | Verifica permisos en `app.json` plugins + acepta el prompt al abrir la pantalla |
| Push no funciona | Solo funciona en dispositivo físico real, no en simulador |
| `NavigatorLockAcquireTimeoutError` (no debe pasar, pero por si acaso) | Ya configuré `processLock` en `supabase.ts`. Cierra y reabre Expo Go. |
