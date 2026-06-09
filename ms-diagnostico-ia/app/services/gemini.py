import json
from pathlib import Path

from google import genai
from google.genai import types

from app.config import Settings
from app.schemas import ChatTriajeResponse


TRIAGE_SYSTEM_PROMPT = """
Eres un asistente de pre-triaje clinico para una app educativa.
No diagnostiques de forma definitiva. Devuelve orientacion, especialidad sugerida,
urgencia y signos de alarma. Responde solo JSON valido con estas claves:
respuesta, especialidad, urgencia, agendar, confianza, signos_alarma, recomendaciones.
urgencia debe ser BAJA, MEDIA o ALTA.
especialidad debe ser una etiqueta corta en MAYUSCULAS.
"""


IMAGE_SYSTEM_PROMPT = """
Analiza la imagen clinica o documento medico de forma prudente.
No emitas diagnostico definitivo. Responde solo JSON valido con:
tipo_imagen, hallazgos, urgencia, recomendacion, confianza, nota_seguridad.
urgencia debe ser BAJA, MEDIA o ALTA.
"""


def _client(settings: Settings) -> genai.Client | None:
    if not settings.gemini_api_key:
        return None
    return genai.Client(api_key=settings.gemini_api_key)


def _json_from_text(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.removeprefix("json").strip()
    return json.loads(cleaned)


def _safe_float(value: object, default: float = 0.7) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_urgency(value: object) -> str:
    urgency = str(value or "MEDIA").upper()
    return urgency if urgency in {"BAJA", "MEDIA", "ALTA"} else "MEDIA"


def _safe_string_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


async def gemini_triage(settings: Settings, message: str, history: list[dict[str, str]]) -> ChatTriajeResponse | None:
    client = _client(settings)
    if client is None:
        return None

    history_text = "\n".join(f"{item.get('rol', 'user')}: {item.get('texto', '')}" for item in history[-8:])
    prompt = f"{TRIAGE_SYSTEM_PROMPT}\nHistorial:\n{history_text}\nMensaje actual:\n{message}"
    response = None
    last_error: Exception | None = None
    for model in settings.gemini_text_models:
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            break
        except Exception as exc:
            last_error = exc
    if response is None:
        raise last_error or RuntimeError("Gemini no devolvio respuesta")
    data = _json_from_text(response.text or "{}")
    return ChatTriajeResponse(
        respuesta=str(data.get("respuesta", "")),
        especialidad=str(data.get("especialidad", "MEDICINA_GENERAL")),
        urgencia=_safe_urgency(data.get("urgencia")),
        agendar=bool(data.get("agendar", True)),
        confianza=_safe_float(data.get("confianza"), 0.7),
        proveedor="gemini",
        signos_alarma=_safe_string_list(data.get("signos_alarma")),
        recomendaciones=_safe_string_list(data.get("recomendaciones")),
    )


async def gemini_image_analysis(settings: Settings, file_path: Path, mime_type: str | None, descripcion: str | None) -> dict | None:
    client = _client(settings)
    if client is None:
        return None

    image_bytes = file_path.read_bytes()
    prompt = IMAGE_SYSTEM_PROMPT
    if descripcion:
        prompt += f"\nContexto clinico aportado por el usuario: {descripcion}"

    response = None
    last_error: Exception | None = None
    for model in settings.gemini_image_models:
        try:
            response = client.models.generate_content(
                model=model,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type or "image/jpeg"),
                    prompt,
                ],
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            break
        except Exception as exc:
            last_error = exc
    if response is None:
        raise last_error or RuntimeError("Gemini no devolvio respuesta")
    data = _json_from_text(response.text or "{}")
    return {
        "proveedor": "gemini",
        "tipo_imagen": str(data.get("tipo_imagen", "imagen_clinica")),
        "hallazgos": _safe_string_list(data.get("hallazgos")),
        "urgencia": _safe_urgency(data.get("urgencia")),
        "recomendacion": str(data.get("recomendacion", "Revisar con un profesional de salud.")),
        "confianza": _safe_float(data.get("confianza"), 0.7),
        "nota_seguridad": str(
            data.get("nota_seguridad", "Resultado informativo. No reemplaza evaluacion medica.")
        ),
    }
