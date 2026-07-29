# HowRunReactMobile — correr `apps/mobile-rn` en tu Android por cable USB

> App Expo SDK 56. Hay DOS rutas: **A) Expo Go** (10 min: login, GraphQL, cámara, GPS,
> biometría y notificaciones LOCALES — suficiente para desarrollar) y **B) Development
> build** (necesaria SOLO para el push REMOTO: desde SDK 53, Expo Go en Android ya no
> soporta push remoto; las locales sí funcionan).

---

## 0. Preparar el teléfono y el ADB (una sola vez)

1. **Modo desarrollador en el Android**: Ajustes → Acerca del teléfono → toca 7 veces
   "Número de compilación" → vuelve → Opciones de desarrollador → activa **Depuración USB**.
2. Conecta el cable. Si el teléfono pregunta el modo USB, elige "Transferencia de archivos".
3. **ADB en Windows**: si tienes Android Studio ya está en
   `%LOCALAPPDATA%\Android\Sdk\platform-tools`. Si no, descarga "SDK Platform-Tools"
   de developer.android.com, descomprime (ej. `C:\platform-tools`) y agrégalo al PATH.
4. Verifica:
```powershell
adb devices
```
   En el teléfono saldrá un diálogo "¿Permitir depuración USB?" → **Permitir** (marca
   "siempre"). `adb devices` debe listar tu equipo como `device` (no `unauthorized`).

## 1. Arreglar `app.json → expo.extra` (obligatorio, hoy tiene placeholders)

Edita `apps/mobile-rn/app.json`:

```json
"extra": {
  "supabaseUrl": "https://krrfinxcfahnqbjxzebr.supabase.co",
  "supabaseAnonKey": "PEGA_LA_PUBLISHABLE_KEY",
  "graphqlUrl": "http://localhost:4000/graphql",
  "blockchainUrl": "http://localhost:3001",
  "eas": { "projectId": "<TU_EAS_PROJECT_ID>" }//sto se arregla con  npx eas login
  
S C:\Users\Usuario\Documents\sw2_projects\SW2_PARCIAL_DOS\clinica\apps\mobile-rn> npx eas init
★ eas-cli@20.0.0 is now available.
To upgrade, run:
npm install -g eas-cli
Proceeding with outdated version.

√ Would you like to create a project for @watertallergrado/clinica-mobile? ... yes
✔ Created @watertallergrado/clinica-mobile: https://expo.dev/accounts/watertallergrado/projects/clinica-mobile
√ Project successfully linked (ID: 626c1e04-5b61-4fec-8e9d-fe55e27ed9a5) (modified app.json)

}
```

- `supabaseUrl` y `supabaseAnonKey`: cópialos de `apps/web-angular/.../environment.local.ts`
  (los mismos del Angular). Sin esto el **login no funciona** (env.ts ya lo advierte).
- `graphqlUrl`/`blockchainUrl` en **localhost**: funciona por USB gracias al paso 2
  (adb reverse). La IP vieja `192.168.64.97` ya no sirve.
- `projectId`: déjalo así en la Ruta A; se llena en la Ruta B con `npx eas init`.

## 2. Levantar backend y abrir los túneles USB

Con tus tareas de VS Code levanta al menos: **MS1 (:3000), MS3 (:8080), Gateway (:4000)**
(y :3001 si probarás el verificador blockchain).

> ⚠️ Si MS1 cambió (p. ej. las mutations de push del commit `movila`), **reinicia el
> Gateway**: introspecciona los subgrafos solo al arrancar; si no, la app no verá
> `registrarPushToken` y fallará en silencio.

Túneles por el cable (repetir cada vez que reconectes el USB):
```powershell
adb reverse tcp:8081 tcp:8081   # Metro (JS de la app)
adb reverse tcp:4000 tcp:4000   # Gateway GraphQL
adb reverse tcp:3001 tcp:3001   # ms-blockchain
adb reverse --list              # verificar
```
Con esto, "localhost" DENTRO del teléfono = tu PC, a través del cable. El teléfono
necesita además su propio internet (datos o cualquier WiFi) para hablar con Supabase.

## 3. RUTA A — Expo Go (rápida)

1. Instala **Expo Go** desde Play Store en el teléfono.
2. En la PC:
```powershell
cd C:\Users\Usuario\Documents\sw2_projects\SW2_PARCIAL_DOS\clinica\apps\mobile-rn
npm install
npx expo start --localhost
```
3. Cuando cargue Metro, presiona **`a`** en esa terminal → instala/abre la app en el
   teléfono por USB automáticamente.
4. **Login**: `jamessuperman74@gmail.com` (Carlos) o `fracasosamesite@gmail.com` /
   `Clinica123!` (Paco).
5. Qué SÍ puedes probar aquí: login + Mis Recetas/Facturas (GraphQL vía gateway),
   Verificador blockchain, cámara, GPS, biometría y la **notificación local** de la
   pantalla Recursos Nativos.
6. Qué NO: el push remoto. En esta ruta `getExpoPushTokenAsync` falla o avisa
   "not supported in Expo Go" — es lo esperado, NO es un bug. Para eso, Ruta B.

## 4. RUTA B — Development build (push remoto real)

Requisitos extra (una vez): **Android Studio** (en el primer arranque deja que instale
SDK Platform + Platform-Tools y acepta licencias; trae su propio JDK).

1. **Proyecto EAS** (gratis): 
```powershell
cd apps\mobile-rn
npx eas init        # login/crea cuenta Expo; escribe el projectId real en app.json
```
2. **Identidad Android + Firebase** (el push remoto fuera de Expo Go viaja por FCM):
   - En `app.json → android` agrega: `"package": "com.clinica.mobile"` y
     `"googleServicesFile": "./google-services.json"`.
   - Firebase console → crear proyecto → "Add app" Android con ese **mismo package** →
     descarga `google-services.json` y ponlo en `apps/mobile-rn/`. Agrégalo a `.gitignore`.
   - Para que Expo pueda ENVIAR por FCM: Firebase → Project settings → Service accounts
     → **Generate new private key** (JSON) → súbelo en `expo.dev` → tu proyecto →
     Credentials → Android → **FCM V1 service account** (o vía `eas credentials`).
3. **Compilar e instalar por USB** (teléfono conectado, primera vez 5–15 min):
```powershell
npx expo run:android
```
   Instala la app "Clinica" nativa en tu teléfono y deja Metro corriendo. Vuelve a
   aplicar los `adb reverse` del paso 2 si reconectaste el cable.
4. **Probar el push de punta a punta**:
   - Login como Carlos → Recursos Nativos → debe mostrar `ExponentPushToken[...]` y
     "Token registrado ✅" (verifícalo: `select email, expo_push_token from usuario;`).
   - Test manual del canal:
```powershell
curl.exe -X POST https://exp.host/--/api/v2/push/send -H "Content-Type: application/json" -d '{\"to\":\"ExponentPushToken[PEGAR]\",\"title\":\"Prueba\",\"body\":\"Canal OK\"}'
```
   - Flujo real: `CITA 1234567 dolor de muela` por WhatsApp/Telegram → vibra el
     push #1 + email; mutation `enviarRecordatorios` → push #2; diagnóstico en
     Angular → push #3.

## 5. Problemas conocidos

| Síntoma | Causa / arreglo |
|---|---|
| `adb devices` vacío | Driver USB o modo de conexión: cambia a "Transferencia de archivos"; reinstala driver del fabricante. |
| `unauthorized` | Acepta el diálogo de depuración en el teléfono (revisa la pantalla). |
| Login: "Network request failed" | Placeholders de Supabase sin llenar en app.json, o el teléfono no tiene internet propio. |
| Mis Recetas/Facturas vacío o error | Gateway apagado o sin reiniciar tras cambios de MS1; `adb reverse tcp:4000` no aplicado; MS1/MS3 caídos. |
| Cambié app.json y no se refleja | Reinicia `expo start` (la config extra se lee al arrancar) y recarga la app (agita el teléfono → Reload). |
| Push: "not supported in Expo Go" | Comportamiento esperado en Ruta A (SDK 53+). Usa Ruta B. |
| `expo run:android` falla por licencias | `sdkmanager --licenses` (en platform-tools/cmdline-tools) y acepta todo. |
| Token registrado pero no vibra | Falta el FCM V1 service account en expo.dev (paso B.2), o probaste en emulador sin Google Play (usa el teléfono físico). |

## Resumen de decisión

- ¿Hoy quieres avanzar con login, GraphQL, cámara, GPS, biometría? → **Ruta A** (10 min).
- ¿Necesitas demostrar el push remoto del requisito 8? → **Ruta B** (una vez configurada,
  `npx expo run:android` y listo; la demo de las 3 notificaciones queda completa).

COMO CORRER WIRELESS
1.adb devices  
2.
Después de reiniciar el celular hay que volver a poner los adb reverse (se borran al reiniciar/desconectar). Te los configuro en la nueva conexión:
3.
Cuando tengas más de un dispositivo, agrega -s <IP:puerto> a cada comando:

PS C:\dev\clinica\apps\mobile-rn> adb kill-server
PS C:\dev\clinica\apps\mobile-rn> $env:ADB_MDNS_AUTO_CONNECT = "0"
PS C:\dev\clinica\apps\mobile-rn> adb start-server
* daemon not running; starting now at tcp:5037
* daemon started successfully
PS C:\dev\clinica\apps\mobile-rn> adb connect 192.168.43.6:46143
connected to 192.168.43.6:46143
PS C:\dev\clinica\apps\mobile-rn> adb devices
List of devices attached
192.168.43.6:46143      device

PS C:\dev\clinica\apps\mobile-rn>