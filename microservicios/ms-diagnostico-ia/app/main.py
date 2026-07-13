import json

from pathlib import Path
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db, init_db
from app.models import DocumentoClinico, ResultadoIa
from app.schemas import (
    ChatAsistenteRequest,
    ChatAsistenteResponse,
    ChatTriajeRequest,
    ChatTriajeResponse,
    DocumentoResponse,
    ImagenAnalisisResponse,
    IndicadoresIaResponse,
    ReporteIaResponse,
    RevisionResultadoRequest,
    ResultadoResponse,
)
from app.services.openai_nav import asistir_navegacion
from app.services.openai_reportes import generar_plan_reporte, transcribir_audio
# Alias con prefijo ia_: el endpoint de abajo se llama analizar_imagen y taparia
# a la funcion importada (el endpoint se llamaria a si mismo).
from app.services.providers import (
    analizar_imagen as ia_analizar_imagen,
    analizar_triaje as ia_analizar_triaje,
    proveedor_activo,
)
from app.services.storage import (
    DocumentoRecord,
    ResultadoRecord,
    get_document,
    get_result,
    list_documents,
    list_results,
    list_results_by_patient,
    save_result,
    save_upload,
    update_result_revision,
)


app = FastAPI(
    title="MS2 - Diagnostico e IA",
    description="Pre-triaje, analisis de imagenes y gestion documental para MediCloud.",
    version="0.1.0",
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


def documento_to_response(doc: DocumentoClinico | DocumentoRecord) -> DocumentoResponse:
    return DocumentoResponse(
        id=doc.id,
        paciente_id=doc.paciente_id,
        nombre_original=doc.nombre_original,
        content_type=doc.content_type,
        s3_bucket=doc.s3_bucket,
        s3_key=doc.s3_key,
        tamano_bytes=doc.tamano_bytes,
        descripcion=doc.descripcion,
        creado_en=doc.creado_en,
    )


def resultado_to_response(row: ResultadoIa | ResultadoRecord) -> ResultadoResponse:
    return ResultadoResponse(
        id=row.id,
        paciente_id=row.paciente_id,
        documento_id=row.documento_id,
        tipo=row.tipo,
        proveedor=row.proveedor,
        resultado=json.loads(row.resultado_json),
        estado_revision=row.estado_revision,
        decision_medica=row.decision_medica,
        revisado_por=row.revisado_por,
        revisado_en=row.revisado_en,
        creado_en=row.creado_en,
    )


@app.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict:
    return {
        "status": "OK",
        "service": settings.app_name,
        "environment": settings.environment,
        "gemini": "configured" if settings.gemini_api_key else "fallback",
        "openai": "configured" if settings.openai_api_key else "fallback",
        # Proveedor que atendera el triaje y el analisis de imagen ahora mismo.
        # Si dice "reglas-locales" es que NINGUNA clave esta configurada.
        "proveedor_activo": proveedor_activo(settings),
        "orden_proveedores": settings.ia_provider_list,
    }


@app.post("/api/chat-triaje", response_model=ChatTriajeResponse)
async def chat_triaje(
    payload: ChatTriajeRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ChatTriajeResponse:
    result = await ia_analizar_triaje(settings, payload.mensaje, payload.historial)

    save_result(
        db,
        settings,
        tipo="chat_triaje",
        proveedor=result.proveedor,
        paciente_id=payload.paciente_id,
        entrada_resumen=payload.mensaje[:500],
        resultado=result.model_dump(),
        estado_revision="NO_APLICA",
    )
    return result


@app.post("/api/chat-asistente", response_model=ChatAsistenteResponse)
async def chat_asistente(
    payload: ChatAsistenteRequest,
    settings: Settings = Depends(get_settings),
) -> ChatAsistenteResponse:
    """Chatbot del frontend: navegacion guiada por rutas + chat general.

    Stateless a proposito: no persiste conversaciones (a diferencia del
    pre-triaje, que si guarda porque es dato clinico). El catalogo de rutas
    viene del frontend ya filtrado por rol y navegar_a se valida contra el.
    """
    return await asistir_navegacion(settings, payload)


@app.post("/api/reporte-ia", response_model=ReporteIaResponse)
async def reporte_ia(
    audio: UploadFile | None = File(None),
    consulta: str | None = Form(None),
    catalogo: str = Form("[]"),
    rol: str = Form(""),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ReporteIaResponse:
    """Reporte con IA por voz.

    Recibe audio (multipart) o una consulta de texto + el catalogo de fuentes
    que el rol puede ver. Transcribe con Whisper (si hay audio) y pide a OpenAI
    un plan de reporte (fuente + columnas + analisis). El movil ejecuta luego la
    consulta real contra el gateway GraphQL. La IA nunca recibe datos de
    pacientes, solo el catalogo de columnas y la consulta.
    """
    try:
        catalogo_data = json.loads(catalogo) if catalogo else []
        if not isinstance(catalogo_data, list):
            catalogo_data = []
    except json.JSONDecodeError:
        catalogo_data = []

    transcripcion = (consulta or "").strip()

    if audio is not None:
        import os
        import tempfile

        suffix = os.path.splitext(audio.filename or "")[1] or ".m4a"
        contenido = await audio.read()
        tmp = tempfile.NamedTemporaryFile(
            delete=False, suffix=suffix, dir=str(settings.upload_path)
        )
        try:
            tmp.write(contenido)
            tmp.flush()
            tmp.close()
            texto = await transcribir_audio(settings, Path(tmp.name))
            if texto:
                transcripcion = texto
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass

    plan = await generar_plan_reporte(settings, transcripcion, catalogo_data, rol)

    # Auditoria best-effort: no rompe la respuesta si la persistencia falla.
    try:
        save_result(
            db,
            settings,
            tipo="reporte_ia",
            proveedor=str(plan.get("proveedor", "desconocido")),
            paciente_id=None,
            entrada_resumen=transcripcion[:500],
            resultado=plan,
            estado_revision="NO_APLICA",
        )
    except Exception:
        pass

    return ReporteIaResponse(
        transcripcion=transcripcion,
        titulo=str(plan.get("titulo", "Reporte con IA")),
        narrativa=str(plan.get("narrativa", "")),
        fuente=plan.get("fuente"),
        columnas=list(plan.get("columnas", [])),
        proveedor=str(plan.get("proveedor", "desconocido")),
    )


@app.post("/api/documentos", response_model=DocumentoResponse)
async def subir_documento(
    file: UploadFile = File(...),
    paciente_id: str | None = Form(None),
    descripcion: str | None = Form(None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DocumentoResponse:
    doc = save_upload(db, settings, file, paciente_id, descripcion)
    return documento_to_response(doc)


@app.get("/api/documentos", response_model=list[DocumentoResponse])
def listar_documentos(
    paciente_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> list[DocumentoResponse]:
    docs = list_documents(db, settings, paciente_id)
    return [documento_to_response(doc) for doc in docs]


@app.get("/api/documentos/{documento_id}", response_model=DocumentoResponse)
def obtener_documento(
    documento_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DocumentoResponse:
    doc = get_document(db, settings, documento_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return documento_to_response(doc)


@app.post("/api/analizar-imagen", response_model=ImagenAnalisisResponse)
async def analizar_imagen(
    file: UploadFile = File(...),
    paciente_id: str | None = Form(None),
    descripcion: str | None = Form(None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ImagenAnalisisResponse:
    doc = save_upload(db, settings, file, paciente_id, descripcion)
    path = settings.upload_path / doc.ruta.split("\\")[-1]
    if not path.exists():
        path = settings.upload_path / doc.ruta.split("/")[-1]

    analysis = await ia_analizar_imagen(
        settings, path, doc.content_type, descripcion, doc.nombre_original
    )

    row = save_result(
        db,
        settings,
        tipo="analisis_imagen",
        proveedor=analysis["proveedor"],
        paciente_id=paciente_id,
        documento_id=doc.id,
        entrada_resumen=descripcion,
        resultado=analysis,
        estado_revision="PENDIENTE",
    )
    return ImagenAnalisisResponse(
        resultado_id=row.id,
        documento=documento_to_response(doc),
        estado_revision=row.estado_revision,
        **analysis,
    )


@app.get("/api/resultados/paciente/{paciente_id}", response_model=list[ResultadoResponse])
def resultados_por_paciente(
    paciente_id: str,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> list[ResultadoResponse]:
    rows = list_results_by_patient(db, settings, paciente_id)
    return [resultado_to_response(row) for row in rows]


@app.get("/api/resultados/{resultado_id}", response_model=ResultadoResponse)
def obtener_resultado(
    resultado_id: int,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ResultadoResponse:
    row = get_result(db, settings, resultado_id)
    if not row:
        raise HTTPException(status_code=404, detail="Resultado IA no encontrado")
    return resultado_to_response(row)


@app.patch("/api/resultados/{resultado_id}/revision", response_model=ResultadoResponse)
def revisar_resultado(
    resultado_id: int,
    payload: RevisionResultadoRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ResultadoResponse:
    row = get_result(db, settings, resultado_id)
    if not row:
        raise HTTPException(status_code=404, detail="Resultado IA no encontrado")
    if row.tipo != "analisis_imagen":
        raise HTTPException(status_code=400, detail="Solo los analisis de imagen requieren revision medica")

    row = update_result_revision(
        db,
        settings,
        row,
        payload.estado_revision,
        payload.decision_medica,
        payload.revisado_por,
    )
    return resultado_to_response(row)


@app.get("/api/indicadores", response_model=IndicadoresIaResponse)
def indicadores_ia(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> IndicadoresIaResponse:
    rows = list_results(db, settings)
    image_rows = [row for row in rows if row.tipo == "analisis_imagen"]
    triage_rows = [row for row in rows if row.tipo == "chat_triaje"]

    def urgency(row: ResultadoIa) -> str:
        try:
            return str(json.loads(row.resultado_json).get("urgencia", "")).upper()
        except json.JSONDecodeError:
            return ""

    return IndicadoresIaResponse(
        total_resultados=len(rows),
        analisis_imagen=len(image_rows),
        pre_triajes=len(triage_rows),
        pendientes_revision=sum(1 for row in image_rows if row.estado_revision == "PENDIENTE"),
        confirmados=sum(1 for row in image_rows if row.estado_revision == "CONFIRMADO"),
        descartados=sum(1 for row in image_rows if row.estado_revision == "DESCARTADO"),
        urgencias_altas=sum(1 for row in rows if urgency(row) == "ALTA"),
    )
