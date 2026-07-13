"""Proveedor Gemini. Usa los prompts/normalizadores compartidos de ia_common,
por lo que su salida es identica a la de OpenAI (solo cambia "proveedor").

El SDK de Google se importa de forma PEREZOSA: si el paquete no esta instalado o
no hay clave, el servicio arranca igual y degrada al siguiente proveedor.
"""
from pathlib import Path

from app.config import Settings
from app.schemas import ChatTriajeResponse
from app.services.ia_common import (
    IMAGE_SYSTEM_PROMPT,
    TRIAGE_SYSTEM_PROMPT,
    build_image_result,
    build_triage_response,
    json_from_text,
)




def _client(settings: Settings):
    if not settings.gemini_api_key:
        return None
    try:
        from google import genai
    except Exception:
        return None
    return genai.Client(api_key=settings.gemini_api_key)










async def gemini_triage(settings: Settings, message: str, history: list[dict[str, str]]) -> ChatTriajeResponse | None:
    client = _client(settings)
    if client is None:
        return None

    from google.genai import types

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
    data = json_from_text(response.text or "{}")
    return build_triage_response(data, proveedor="gemini")


async def gemini_image_analysis(settings: Settings, file_path: Path, mime_type: str | None, descripcion: str | None) -> dict | None:
    client = _client(settings)
    if client is None:
        return None

    from google.genai import types

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
    data = json_from_text(response.text or "{}")
    return build_image_result(data, proveedor="gemini")
