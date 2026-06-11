from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ChatTriajeRequest(BaseModel):
    mensaje: str = Field(min_length=1, max_length=4000)
    historial: list[dict[str, str]] = []
    paciente_id: str | None = None


class ChatTriajeResponse(BaseModel):
    respuesta: str
    especialidad: str
    urgencia: str
    agendar: bool
    confianza: float
    proveedor: str
    signos_alarma: list[str] = []
    recomendaciones: list[str] = []


class DocumentoResponse(BaseModel):
    id: int
    paciente_id: str | None
    nombre_original: str
    content_type: str | None
    s3_bucket: str | None = None
    s3_key: str | None = None
    tamano_bytes: int
    descripcion: str | None
    creado_en: datetime


class ImagenAnalisisResponse(BaseModel):
    resultado_id: int | None = None
    documento: DocumentoResponse | None = None
    proveedor: str
    tipo_imagen: str
    hallazgos: list[str]
    urgencia: str
    recomendacion: str
    confianza: float
    nota_seguridad: str
    estado_revision: str = "PENDIENTE"


class ReporteIaResponse(BaseModel):
    transcripcion: str = ""
    titulo: str
    narrativa: str
    fuente: str | None = None
    columnas: list[str] = []
    proveedor: str


class ResultadoResponse(BaseModel):
    id: int
    paciente_id: str | None
    documento_id: int | None
    tipo: str
    proveedor: str
    resultado: dict[str, Any]
    estado_revision: str
    decision_medica: str | None = None
    revisado_por: str | None = None
    revisado_en: datetime | None = None
    creado_en: datetime


class RevisionResultadoRequest(BaseModel):
    estado_revision: str = Field(pattern="^(CONFIRMADO|DESCARTADO|PENDIENTE)$")
    decision_medica: str | None = Field(default=None, max_length=1000)
    revisado_por: str | None = Field(default=None, max_length=120)


class IndicadoresIaResponse(BaseModel):
    total_resultados: int
    analisis_imagen: int
    pre_triajes: int
    pendientes_revision: int
    confirmados: int
    descartados: int
    urgencias_altas: int
