@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM   "Cli_f4200_b3000.bat"  -  Proyecto CLI (clinica) en UNA
REM   ventana, 1 TAB con 6 PANELES y PUERTOS FIJOS.
REM   (Windows Terminal 'wt' + split-pane).
REM     - Sup-izq : FRONTEND  Angular  :4200  (ng serve)
REM     - Med-izq : NEXTJS    BFF/MS1   :3000  (next dev, GraphQL + Supabase)
REM     - Inf-izq : SPRING    MS3 Java  :8080  (spring-boot:run, gestion+Stripe)
REM     - Sup-der : BLOCK     MS4 Node  :3001  (server.js, Polygon Amoy)
REM     - Med-der : FASTAPI   MS2 IA    :8000  (uvicorn, diagnostico + OpenAI)
REM     - Inf-der : CONSOLA   terminal vacia en la raiz del repo
REM
REM   App:  http://localhost:4200    Next/BFF: http://localhost:3000
REM   Java: http://localhost:8080    Block:    http://localhost:3001
REM   IA:   http://localhost:8000    Evolution/WA: http://localhost:8082
REM
REM   ------------------------------------------------------------
REM   Evolution API (WhatsApp via QR):
REM     Se levanta con el perfil "whatsapp":
REM       Cli_f4200_b3000.bat /whatsapp
REM     Abre http://localhost:8082 para escanear el QR con tu WhatsApp.
REM     La instancia se llama "clinica" y la API key es "clinica-evo-key-2026".
REM     Para exponer a n8n Cloud usa ngrok: ngrok http 8082
REM   ------------------------------------------------------------
REM
REM   Uso:
REM     "Cli_f4200_b3000.bat"              libera puertos y levanta todo
REM     "Cli_f4200_b3000.bat" /check       solo diagnostico (no mata nada)
REM     "Cli_f4200_b3000.bat" /build       igual, pero reconstruye imagenes
REM     "Cli_f4200_b3000.bat" /whatsapp    levanta TAMBIEN Evolution API :8082
REM     "Cli_f4200_b3000.bat" /stop        detiene los contenedores
REM     "Cli_f4200_b3000.bat" /down        elimina los contenedores
REM ============================================================

REM  >>> AJUSTA ESTA RUTA a donde clonaste el repo cli <<<
set PROY=C:\Users\Usuario\Desktop\cli
if not exist "%PROY%\docker-compose.yml" if exist "%~dp0docker-compose.yml" set PROY=%~dp0.

set PORT_FRONT=4200
set PORT_NEXT=3000
set PORT_SPRING=8080
set PORT_BLOCK=3001
set PORT_ML=8000
set PORT_EVO=8082

set WITH_EVOLUTION=0
if /i "%~1"=="/whatsapp" set WITH_EVOLUTION=1

if /i "%~1"=="/check"    goto :check
if /i "%~1"=="/stop"     goto :stop
if /i "%~1"=="/down"     goto :down

set COMPOSE_EXTRA=
if /i "%~1"=="/build"    set COMPOSE_EXTRA=--build

echo.
echo === CLI - front:%PORT_FRONT% next:%PORT_NEXT% spring:%PORT_SPRING% block:%PORT_BLOCK% ia:%PORT_ML% evo:%PORT_EVO% ===
echo.

if not exist "%PROY%\docker-compose.yml" (
  echo    ERROR: no encuentro "%PROY%\docker-compose.yml".
  echo           Edita la variable PROY al inicio del bat.
  pause & goto :eof
)

docker info >nul 2>&1
if errorlevel 1 (
  echo    ERROR: Docker Desktop no esta corriendo. Abrelo y reintenta.
  pause & goto :eof
)

if not exist "%PROY%\.env" (
  echo    AVISO: falta "%PROY%\.env".
  echo           Copia ".env.example" a ".env" y rellenalo.
  echo.
  choice /c SN /m "Continuar de todos modos"
  if errorlevel 2 goto :eof
)

echo [1/6] Liberando puerto %PORT_FRONT% (FRONTEND Angular)...
call :liberar %PORT_FRONT%
echo [2/6] Liberando puerto %PORT_NEXT% (NEXTJS BFF)...
call :liberar %PORT_NEXT%
echo [3/6] Liberando puerto %PORT_SPRING% (SPRING Boot)...
call :liberar %PORT_SPRING%
echo [4/6] Liberando puerto %PORT_BLOCK% (BLOCKCHAIN Node)...
call :liberar %PORT_BLOCK%
echo [5/6] Liberando puerto %PORT_ML% (FASTAPI IA)...
call :liberar %PORT_ML%
echo.

REM ── Servicios principales ─────────────────────────────────
echo [6/6] Levantando el stack principal...
pushd "%PROY%"
docker compose up -d %COMPOSE_EXTRA% frontend ms-pacientes ms-gestion ms-blockchain ms-diagnostico-ia
if errorlevel 1 (
  echo    ERROR: docker compose up fallo.
  popd & pause & goto :eof
)
popd

REM ── Evolution API (WhatsApp) - solo con /whatsapp ─────────
if "%WITH_EVOLUTION%"=="1" (
  echo.
  echo [+] Levantando Evolution API en puerto %PORT_EVO%...
  call :liberar %PORT_EVO%
  pushd "%PROY%"
  docker compose -f docker-compose.evolution.yml up -d
  if errorlevel 1 (
    echo    AVISO: Evolution API no pudo levantarse. Revisa docker-compose.evolution.yml
  ) else (
    echo    Evolution API corriendo en http://localhost:%PORT_EVO%
    echo    Escanea el QR en: http://localhost:%PORT_EVO%
    echo    Para exponer a n8n Cloud: ngrok http %PORT_EVO%
  )
  popd
)

pushd "%PROY%"
docker compose ps
popd

echo.
echo Abriendo los 6 paneles con logs en vivo...

if "%WITH_EVOLUTION%"=="1" (
  wt -w new new-tab --title FRONT-4200 -d "%PROY%" cmd /k "docker compose logs -f --tail 80 frontend" ; split-pane -V --title BLOCK-3001 -d "%PROY%" cmd /k "docker compose logs -f --tail 80 ms-blockchain" ; split-pane -H --title FASTAPI-8000 -d "%PROY%" cmd /k "docker compose logs -f --tail 80 ms-diagnostico-ia" ; split-pane -H --title EVOLUTION-8082 -d "%PROY%" cmd /k "docker compose -f docker-compose.evolution.yml logs -f --tail 80" ; move-focus left ; split-pane -H --title NEXT-3000 -d "%PROY%" cmd /k "docker compose logs -f --tail 80 ms-pacientes" ; split-pane -H --title SPRING-8080 -d "%PROY%" cmd /k "docker compose logs -f --tail 80 ms-gestion"
) else (
  wt -w new new-tab --title FRONT-4200 -d "%PROY%" cmd /k "docker compose logs -f --tail 80 frontend" ; split-pane -V --title BLOCK-3001 -d "%PROY%" cmd /k "docker compose logs -f --tail 80 ms-blockchain" ; split-pane -H --title FASTAPI-8000 -d "%PROY%" cmd /k "docker compose logs -f --tail 80 ms-diagnostico-ia" ; split-pane -H --title CONSOLA -d "%PROY%" cmd ; move-focus left ; split-pane -H --title NEXT-3000 -d "%PROY%" cmd /k "docker compose logs -f --tail 80 ms-pacientes" ; split-pane -H --title SPRING-8080 -d "%PROY%" cmd /k "docker compose logs -f --tail 80 ms-gestion"
)

echo.
echo Stack levantado. Cerrar esta ventana NO apaga la app.
echo Para apagar:  "%~nx0" /stop
if "%WITH_EVOLUTION%"=="1" (
  echo.
  echo Evolution API activa en http://localhost:%PORT_EVO%
  echo Recuerda: ngrok http %PORT_EVO%  para exponer a n8n Cloud
)
goto :eof


REM ------------------------------------------------------------
REM  :liberar <puerto>
REM ------------------------------------------------------------
:liberar
set _P=%~1

for /f "tokens=*" %%c in ('docker ps --filter "publish=%_P%" --format "{{.Names}}" 2^>nul') do (
  echo     contenedor docker "%%c" publica :%_P%  -^> docker stop
  docker stop %%c >nul 2>&1
)

for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr /c:"LISTENING" ^| findstr /c:":%_P% "') do (
  if not "%%p"=="0" if not "%%p"=="4" (
    for /f "tokens=1 delims=," %%n in ('tasklist /nh /fo csv /fi "PID eq %%p" 2^>nul') do echo     PID %%p = %%~n  -^> taskkill
    taskkill /F /PID %%p >nul 2>&1
  )
)

netstat -ano -p tcp | findstr /c:"LISTENING" | findstr /c:":%_P% " >nul 2>&1
if errorlevel 1 (
  echo     puerto %_P% LIBRE
) else (
  echo     AVISO: el puerto %_P% SIGUE OCUPADO
)
exit /b


REM ------------------------------------------------------------
REM  :stop
REM ------------------------------------------------------------
:stop
if not exist "%PROY%\docker-compose.yml" ( echo ERROR: ruta PROY invalida. & pause & goto :eof )
echo Deteniendo el stack de cli...
pushd "%PROY%"
docker compose stop
if exist "%PROY%\docker-compose.evolution.yml" (
  echo Deteniendo Evolution API...
  docker compose -f docker-compose.evolution.yml stop
)
popd
echo Listo. Contenedores detenidos; volumenes y datos intactos.
goto :eof


REM ------------------------------------------------------------
REM  :down
REM ------------------------------------------------------------
:down
if not exist "%PROY%\docker-compose.yml" ( echo ERROR: ruta PROY invalida. & pause & goto :eof )
echo Eliminando contenedores de cli (SIN -v)...
pushd "%PROY%"
docker compose down
if exist "%PROY%\docker-compose.evolution.yml" (
  echo Eliminando contenedor Evolution API...
  docker compose -f docker-compose.evolution.yml down
)
popd
echo Listo. Contenedores eliminados; volumenes conservados.
goto :eof


REM ------------------------------------------------------------
REM  :check
REM ------------------------------------------------------------
:check
echo.
echo === DIAGNOSTICO DE PUERTOS (no se mata nada) ===
call :quien %PORT_FRONT%  "FRONTEND Angular"
call :quien %PORT_NEXT%   "NEXTJS BFF"
call :quien %PORT_SPRING% "SPRING Boot"
call :quien %PORT_BLOCK%  "BLOCKCHAIN Node"
call :quien %PORT_ML%     "FASTAPI IA"
call :quien %PORT_EVO%    "Evolution API (WhatsApp)"
echo.
echo --- estado de los contenedores ---
docker info >nul 2>&1
if errorlevel 1 (
  echo     Docker Desktop NO esta corriendo
) else (
  if exist "%PROY%\docker-compose.yml" (
    pushd "%PROY%"
    docker compose ps
    if exist "docker-compose.evolution.yml" docker compose -f docker-compose.evolution.yml ps
    popd
  ) else echo     ruta PROY invalida
)
echo.
pause
exit /b 0

:quien
set _P=%~1
echo.
echo --- puerto %_P%  (%~2) ---
netstat -ano -p tcp | findstr /c:"LISTENING" | findstr /c:":%_P% "
if errorlevel 1 echo     nadie escucha en %_P% : LIBRE
for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr /c:"LISTENING" ^| findstr /c:":%_P% "') do (
  tasklist /nh /fo table /fi "PID eq %%p" 2>nul
)
for /f "tokens=*" %%c in ('docker ps --filter "publish=%_P%" --format "{{.Names}} ({{.Image}})" 2^>nul') do (
  echo     contenedor docker: %%c
)
exit /b
