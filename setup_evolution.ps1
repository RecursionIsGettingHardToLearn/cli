# ============================================================
#  setup_evolution.ps1 — Instala y configura Evolution API
#  para enviar mensajes de WhatsApp sin verificación de Meta
#
#  USO:
#    .\setup_evolution.ps1          # instala y crea la instancia
#    .\setup_evolution.ps1 -QR      # muestra el QR para escanear
#    .\setup_evolution.ps1 -Estado  # verifica si está conectado
#    .\setup_evolution.ps1 -Parar   # detiene Evolution API
# ============================================================

param(
    [switch]$QR,
    [switch]$Estado,
    [switch]$Parar
)

$BASE_URL   = "http://localhost:8082"
$API_KEY    = "clinica-evo-key-2026"
$INSTANCIA  = "clinica"
$HEADERS    = @{ "apikey" = $API_KEY; "Content-Type" = "application/json" }
$COMPOSE    = "docker-compose.evolution.yml"

function Ok($msg)   { Write-Host "  ✅ $msg" -ForegroundColor Green  }
function Warn($msg) { Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function Err($msg)  { Write-Host "  ❌ $msg" -ForegroundColor Red    }
function Info($msg) { Write-Host "  ℹ️  $msg" -ForegroundColor Cyan   }

# ── PARAR ────────────────────────────────────────────────────
if ($Parar) {
    Write-Host "Deteniendo Evolution API..." -ForegroundColor White
    docker compose -f $COMPOSE down
    Ok "Evolution API detenida."
    exit 0
}

# ── ESTADO ───────────────────────────────────────────────────
if ($Estado) {
    Write-Host "Verificando estado de la instancia '$INSTANCIA'..." -ForegroundColor White
    try {
        $r = Invoke-RestMethod -Uri "$BASE_URL/instance/fetchInstances" -Headers $HEADERS -Method GET
        $inst = $r | Where-Object { $_.instance.instanceName -eq $INSTANCIA }
        if ($inst) {
            $estado = $inst.instance.state
            if ($estado -eq "open") {
                Ok "Conectado a WhatsApp (estado: $estado)"
                Info "Listo para enviar mensajes desde n8n"
            } else {
                Warn "Estado: $estado — escanea el QR: .\setup_evolution.ps1 -QR"
            }
        } else {
            Warn "Instancia '$INSTANCIA' no existe todavía. Corre el script sin flags."
        }
    } catch {
        Err "No se pudo conectar a Evolution API. ¿Está corriendo?"
        Info "Inicia con: docker compose -f $COMPOSE up -d"
    }
    exit 0
}

# ── QR ───────────────────────────────────────────────────────
if ($QR) {
    Write-Host "Obteniendo QR para la instancia '$INSTANCIA'..." -ForegroundColor White
    try {
        $r = Invoke-RestMethod -Uri "$BASE_URL/instance/connect/$INSTANCIA" -Headers $HEADERS -Method GET
        if ($r.code) {
            Write-Host ""
            Write-Host "  Escanea este QR con WhatsApp (Settings → Linked Devices):" -ForegroundColor Yellow
            Write-Host ""
            # Abrir el QR en el navegador
            Start-Process "http://localhost:8081/instance/qrcode/$INSTANCIA/image"
            Ok "QR abierto en el navegador. Escanéalo con WhatsApp en 30 segundos."
        } else {
            $estado = $r.instance.state ?? $r.state ?? "desconocido"
            if ($estado -eq "open") {
                Ok "Ya está conectado (estado: open). No necesitas escanear de nuevo."
            } else {
                Warn "Estado: $estado"
                Info "Intenta abrir manualmente: http://localhost:8081"
            }
        }
    } catch {
        Err "Error al obtener QR: $_"
        Info "Abre manualmente: http://localhost:8081"
    }
    exit 0
}

# ══════════════════════════════════════════════════════════════
#  INSTALACIÓN COMPLETA
# ══════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "  Configurando Evolution API para WhatsApp..." -ForegroundColor White
Write-Host ""

# 1. Verificar Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Err "Docker no encontrado. Instala Docker Desktop primero."
    exit 1
}
Ok "Docker disponible"

# 2. Levantar contenedor
Write-Host "  Levantando Evolution API (puerto 8081)..." -ForegroundColor White
docker compose -f $COMPOSE up -d 2>&1 | Out-Null
Start-Sleep -Seconds 5

# Verificar que levantó
$intentos = 0
$listo = $false
while ($intentos -lt 12) {
    try {
        $test = Invoke-WebRequest -Uri "$BASE_URL" -TimeoutSec 2 -ErrorAction Stop
        $listo = $true
        break
    } catch {
        $intentos++
        Start-Sleep -Seconds 3
    }
}

if (-not $listo) {
    Err "Evolution API no respondió después de 36 segundos."
    Info "Revisa los logs: docker compose -f $COMPOSE logs"
    exit 1
}
Ok "Evolution API corriendo en $BASE_URL"

# 3. Crear instancia
Write-Host "  Creando instancia '$INSTANCIA'..." -ForegroundColor White
try {
    $body = @{ instanceName = $INSTANCIA; qrcode = $true } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BASE_URL/instance/create" -Headers $HEADERS -Method POST -Body $body
    Ok "Instancia '$INSTANCIA' creada"
} catch {
    $msg = $_.Exception.Message
    if ($msg -like "*already*" -or $msg -like "*exists*") {
        Ok "Instancia '$INSTANCIA' ya existe (reutilizando)"
    } else {
        Warn "Respuesta al crear instancia: $msg"
    }
}

# 4. Mostrar QR
Start-Sleep -Seconds 3
Write-Host ""
Write-Host "  Abriendo QR en el navegador..." -ForegroundColor Yellow
Start-Process "$BASE_URL"
Write-Host ""

# 5. Instrucciones
Write-Host "════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  PASOS PARA CONECTAR WHATSAPP:" -ForegroundColor White
Write-Host ""
Write-Host "  1. En el navegador que se abrió:" -ForegroundColor White
Write-Host "     → Busca la instancia 'clinica'" -ForegroundColor Gray
Write-Host "     → Haz clic en 'Connect' o 'QR Code'" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. En tu teléfono (WhatsApp personal):" -ForegroundColor White
Write-Host "     → Configuración → Dispositivos vinculados" -ForegroundColor Gray
Write-Host "     → Vincular un dispositivo → Escanea el QR" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Verifica la conexión:" -ForegroundColor White
Write-Host "     .\setup_evolution.ps1 -Estado" -ForegroundColor Gray
Write-Host ""
Write-Host "════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Info "Configuración de n8n:"
Info "  URL base: $BASE_URL"
Info "  API Key:  $API_KEY"
Info "  Instancia: $INSTANCIA"
Info "  Endpoint envío: POST $BASE_URL/message/sendText/$INSTANCIA"
Write-Host ""
Ok "Evolution API lista. Escanea el QR para conectar WhatsApp."
