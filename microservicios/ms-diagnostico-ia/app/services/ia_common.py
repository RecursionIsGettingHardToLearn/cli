"""Prompts y normalizadores compartidos por TODOS los proveedores de IA.

OpenAI pasa su respuesta por los mismos
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
Actua como un CLASIFICADOR de imagenes clinicas mediante clasificacion zero-shot
(un modelo vision-lenguaje que clasifica sin entrenamiento previo especifico).
Puedes recibir radiografias, fotos de lesiones, heridas, documentos clinicos,
informes o imagenes no medicas.

1) Segun el tipo de estudio, define de 3 a 5 CLASES candidatas plausibles.
   Ej. radiografia de torax: "Normal", "Neumonia", "Derrame pleural",
   "Cardiomegalia", "Otro hallazgo". Si la imagen NO es medica, usa clases como
   "No es imagen medica".
2) Estima la probabilidad de cada clase (0 a 1) de modo que SUMEN ~1.0, como la
   salida softmax de un clasificador.
3) La clase de mayor probabilidad es "clasificacion" y su valor es "probabilidad".

Es solo apoyo, NUNCA un diagnostico definitivo; recomienda confirmacion profesional.

Ademas, actua como un DETECTOR DE ANOMALIAS no supervisado: evalua que tan
ATIPICA es la imagen respecto a lo esperable/normal para su tipo, con un
"score_anomalia" de 0 a 1 (0 = tipica/sin desviaciones, 1 = muy atipica). Marca
"es_anomalo" en true si score_anomalia >= 0.5, y explica brevemente por que en
"justificacion_anomalia".

Responde SOLO JSON valido con estas claves:
clasificacion (string, la clase mas probable),
probabilidad (number 0 a 1 de esa clase),
probabilidades (arreglo de objetos {clase, probabilidad}, ordenado de mayor a menor, sumando ~1.0),
score_anomalia (number 0 a 1), es_anomalo (boolean), justificacion_anomalia (string),
tipo_imagen, hallazgos (arreglo de strings que sustentan la clasificacion),
urgencia (BAJA, MEDIA o ALTA), recomendacion, nota_seguridad.
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


def _normalizar_probabilidades(raw: object) -> list[dict]:
    """Deja las clases como salida de clasificador: floats, ordenadas desc y
    normalizadas para que sumen 1.0 (por si el modelo no lo hizo exacto)."""
    if not isinstance(raw, list):
        return []
    clases: list[dict] = []
    for item in raw:
        if isinstance(item, dict) and item.get("clase"):
            clases.append({
                "clase": str(item.get("clase")),
                "probabilidad": max(0.0, safe_float(item.get("probabilidad"), 0.0)),
            })
    clases.sort(key=lambda c: c["probabilidad"], reverse=True)
    total = sum(c["probabilidad"] for c in clases)
    if total > 0:
        for c in clases:
            c["probabilidad"] = round(c["probabilidad"] / total, 4)
    return clases[:6]


def build_image_result(data: dict, proveedor: str) -> dict:
    """Normaliza el analisis de imagen sin importar el proveedor."""
    probabilidades = _normalizar_probabilidades(data.get("probabilidades"))
    top = probabilidades[0] if probabilidades else None
    clasificacion = str(data.get("clasificacion") or (top["clase"] if top else "No concluyente"))
    probabilidad = safe_float(data.get("probabilidad"), top["probabilidad"] if top else 0.0)
    score_anomalia = min(1.0, max(0.0, safe_float(data.get("score_anomalia"), 0.0)))
    es_anomalo = bool(data.get("es_anomalo")) if data.get("es_anomalo") is not None else score_anomalia >= 0.5
    return {
        "proveedor": proveedor,
        "tipo_imagen": str(data.get("tipo_imagen", "imagen_clinica")),
        "clasificacion": clasificacion,
        "probabilidad": probabilidad,
        "probabilidades": probabilidades,
        "score_anomalia": round(score_anomalia, 4),
        "es_anomalo": es_anomalo,
        "justificacion_anomalia": str(data.get("justificacion_anomalia", "")),
        "hallazgos": safe_string_list(data.get("hallazgos")),
        "urgencia": safe_urgency(data.get("urgencia")),
        "recomendacion": str(data.get("recomendacion", "Revisar con un profesional de salud.")),
        "confianza": safe_float(data.get("confianza"), probabilidad or 0.7),
        "nota_seguridad": str(
            data.get("nota_seguridad", "Resultado informativo. No reemplaza evaluacion medica.")
        ),
    }
