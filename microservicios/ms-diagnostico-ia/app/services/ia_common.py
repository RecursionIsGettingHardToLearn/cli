"""Prompts y normalizadores compartidos por TODOS los proveedores de IA.

Gemini y OpenAI usan los mismos prompts y pasan su respuesta por los mismos
normalizadores, de modo que la salida sea identica sin importar quien la genere.
Gracias a esto, el panel Angular y la app movil no necesitan saber que proveedor
respondio: el contrato de la API no cambia.
"""
from __future__ import annotations

import json

from app.schemas import ChatTriajeResponse


TRIAGE_SYSTEM_PROMPT = """
Eres un asistente de pre-triaje clinico para una app educativa.
No diagnostiques de forma definitiva. Si el paciente da poco contexto, pide datos concretos
en la respuesta: sintoma principal, duracion, intensidad, edad aproximada y signos de alarma.
Devuelve orientacion, especialidad sugerida, urgencia y signos de alarma. Responde solo JSON valido con estas claves:
respuesta, especialidad, urgencia, agendar, confianza, signos_alarma, recomendaciones.
urgencia debe ser BAJA, MEDIA o ALTA.
especialidad debe ser una etiqueta corta en MAYUSCULAS.
"""


IMAGE_SYSTEM_PROMPT = """
Analiza la imagen clinica o documento medico de forma prudente para apoyar al medico.
Puedes recibir radiografias, fotos de lesiones, heridas, documentos clinicos, recetas,
informes o imagenes no medicas. Identifica el tipo de imagen y describe hallazgos visibles.
Si la imagen no es medica, dilo claramente. Si es una radiografia o lesion, sugiere posibles
hallazgos solo como apoyo, nunca como diagnostico definitivo. Recomienda confirmacion por
profesional y pruebas complementarias cuando corresponda.
Responde solo JSON valido con:
tipo_imagen, hallazgos, urgencia, recomendacion, confianza, nota_seguridad.
hallazgos debe ser SIEMPRE un arreglo de strings.
urgencia debe ser BAJA, MEDIA o ALTA.
"""


def json_from_text(text: str) -> dict:
    """Parsea el JSON del modelo, tolerando que venga envuelto en ```json ... ```."""
    cleaned = (text or "{}").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.removeprefix("json").strip()
    return json.loads(cleaned)


def safe_float(value: object, default: float = 0.7) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_urgency(value: object) -> str:
    urgency = str(value or "MEDIA").upper()
    return urgency if urgency in {"BAJA", "MEDIA", "ALTA"} else "MEDIA"


def safe_string_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def build_triage_response(data: dict, proveedor: str) -> ChatTriajeResponse:
    """Convierte el JSON crudo del modelo en la respuesta tipada del API."""
    return ChatTriajeResponse(
        respuesta=str(data.get("respuesta", "")),
        especialidad=str(data.get("especialidad", "MEDICINA_GENERAL")),
        urgencia=safe_urgency(data.get("urgencia")),
        agendar=bool(data.get("agendar", True)),
        confianza=safe_float(data.get("confianza"), 0.7),
        proveedor=proveedor,
        signos_alarma=safe_string_list(data.get("signos_alarma")),
        recomendaciones=safe_string_list(data.get("recomendaciones")),
    )


def build_image_result(data: dict, proveedor: str) -> dict:
    """Normaliza el analisis de imagen sin importar el proveedor."""
    return {
        "proveedor": proveedor,
        "tipo_imagen": str(data.get("tipo_imagen", "imagen_clinica")),
        "hallazgos": safe_string_list(data.get("hallazgos")),
        "urgencia": safe_urgency(data.get("urgencia")),
        "recomendacion": str(data.get("recomendacion", "Revisar con un profesional de salud.")),
        "confianza": safe_float(data.get("confianza"), 0.7),
        "nota_seguridad": str(
            data.get("nota_seguridad", "Resultado informativo. No reemplaza evaluacion medica.")
        ),
    }
