import json

from datetime import datetime
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db, init_db
from app.models import DocumentoClinico, ResultadoIa
from app.schemas import (
    ChatTriajeRequest,
    ChatTriajeResponse,
    DocumentoResponse,
    ImagenAnalisisResponse,
    IndicadoresIaResponse,
    RevisionResultadoRequest,
    ResultadoResponse,
)
from app.services.gemini import gemini_image_analysis, gemini_triage
from app.services.rules import fallback_image_analysis, rule_based_triage
from app.services.storage import save_result, save_upload


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


def documento_to_response(doc: DocumentoClinico) -> DocumentoResponse:
    return DocumentoResponse(
        id=doc.id,
        paciente_id=doc.paciente_id,
        nombre_original=doc.nombre_original,
        content_type=doc.content_type,
        tamano_bytes=doc.tamano_bytes,
        descripcion=doc.descripcion,
        creado_en=doc.creado_en,
    )


def resultado_to_response(row: ResultadoIa) -> ResultadoResponse:
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
    }


@app.post("/api/chat-triaje", response_model=ChatTriajeResponse)
async def chat_triaje(
    payload: ChatTriajeRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ChatTriajeResponse:
    try:
        result = await gemini_triage(settings, payload.mensaje, payload.historial)
    except Exception:
        result = None

    if result is None:
        result = rule_based_triage(payload.mensaje)

    save_result(
        db,
        tipo="chat_triaje",
        proveedor=result.proveedor,
        paciente_id=payload.paciente_id,
        entrada_resumen=payload.mensaje[:500],
        resultado=result.model_dump(),
        estado_revision="NO_APLICA",
    )
    return result


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
def listar_documentos(paciente_id: str, db: Session = Depends(get_db)) -> list[DocumentoResponse]:
    docs = (
        db.query(DocumentoClinico)
        .filter(DocumentoClinico.paciente_id == paciente_id)
        .order_by(DocumentoClinico.creado_en.desc())
        .limit(100)
        .all()
    )
    return [documento_to_response(doc) for doc in docs]


@app.get("/api/documentos/{documento_id}", response_model=DocumentoResponse)
def obtener_documento(documento_id: int, db: Session = Depends(get_db)) -> DocumentoResponse:
    doc = db.get(DocumentoClinico, documento_id)
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

    try:
        analysis = await gemini_image_analysis(settings, path, doc.content_type, descripcion)
    except Exception:
        analysis = None

    if analysis is None:
        analysis = fallback_image_analysis(doc.nombre_original, doc.content_type)

    row = save_result(
        db,
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
def resultados_por_paciente(paciente_id: str, db: Session = Depends(get_db)) -> list[ResultadoResponse]:
    rows = (
        db.query(ResultadoIa)
        .filter(ResultadoIa.paciente_id == paciente_id)
        .order_by(ResultadoIa.creado_en.desc())
        .limit(50)
        .all()
    )
    return [resultado_to_response(row) for row in rows]


@app.get("/api/resultados/{resultado_id}", response_model=ResultadoResponse)
def obtener_resultado(resultado_id: int, db: Session = Depends(get_db)) -> ResultadoResponse:
    row = db.get(ResultadoIa, resultado_id)
    if not row:
        raise HTTPException(status_code=404, detail="Resultado IA no encontrado")
    return resultado_to_response(row)


@app.patch("/api/resultados/{resultado_id}/revision", response_model=ResultadoResponse)
def revisar_resultado(
    resultado_id: int,
    payload: RevisionResultadoRequest,
    db: Session = Depends(get_db),
) -> ResultadoResponse:
    row = db.get(ResultadoIa, resultado_id)
    if not row:
        raise HTTPException(status_code=404, detail="Resultado IA no encontrado")
    if row.tipo != "analisis_imagen":
        raise HTTPException(status_code=400, detail="Solo los analisis de imagen requieren revision medica")

    row.estado_revision = payload.estado_revision
    row.decision_medica = payload.decision_medica
    row.revisado_por = payload.revisado_por
    row.revisado_en = datetime.utcnow() if payload.estado_revision != "PENDIENTE" else None
    db.commit()
    db.refresh(row)
    return resultado_to_response(row)


@app.get("/api/indicadores", response_model=IndicadoresIaResponse)
def indicadores_ia(db: Session = Depends(get_db)) -> IndicadoresIaResponse:
    rows = db.query(ResultadoIa).all()
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
