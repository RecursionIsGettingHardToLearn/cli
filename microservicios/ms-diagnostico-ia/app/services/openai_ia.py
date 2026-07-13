"""Proveedor OpenAI para pre-triaje y analisis de imagen.

Alternativa a Gemini: usa los MISMOS prompts y normalizadores (ia_common), asi
que la respuesta es identica y ni el panel Angular ni el movil notan la diferencia
(salvo por el campo "proveedor", que dira "openai").

- Pre-triaje  -> chat.completions con response_format JSON.
- Imagen      -> vision: la imagen viaja como data URI base64 al modelo multimodal.

Si no hay OPENAI_API_KEY las funciones devuelven None y el caller degrada al
siguiente proveedor (o al fallback por reglas).
"""
from __future__ import annotations

import asyncio
import base64
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


# La API de vision de OpenAI solo acepta estos formatos de imagen.
# Un PDF o un audio NO se pueden analizar por esta via: devolvemos None para
# que el caller degrade al fallback en vez de reventar con un 400 del proveedor.
MIME_SOPORTADOS = {"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"}


def _client(settings: Settings):
    """Crea el cliente solo si hay clave. Import perezoso: si el paquete no esta
    instalado, el servicio sigue arrancando (degradara a reglas)."""
    if not settings.openai_api_key:
        return None
    try:
        from openai import OpenAI
    except Exception:
        return None
    return OpenAI(api_key=settings.openai_api_key)


def _rol_openai(rol: str) -> str:
    """Mapea el rol del historial del chat al vocabulario de OpenAI."""
    return "assistant" if str(rol).lower() in {"assistant", "ia", "bot", "asistente"} else "user"


async def openai_triage(
    settings: Settings,
    message: str,
    history: list[dict[str, str]],
) -> ChatTriajeResponse | None:
    client = _client(settings)
    if client is None:
        return None

    mensajes: list[dict] = [{"role": "system", "content": TRIAGE_SYSTEM_PROMPT}]
    for item in history[-8:]:
        texto = item.get("texto", "")
        if texto:
            mensajes.append({"role": _rol_openai(item.get("rol", "user")), "content": texto})
    mensajes.append({"role": "user", "content": message})

    def _run() -> dict:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=mensajes,
        )
        return json_from_text(resp.choices[0].message.content or "{}")

    data = await asyncio.to_thread(_run)
    return build_triage_response(data, proveedor="openai")


async def openai_image_analysis(
    settings: Settings,
    file_path: Path,
    mime_type: str | None,
    descripcion: str | None,
) -> dict | None:
    client = _client(settings)
    if client is None:
        return None

    mime = (mime_type or "image/jpeg").lower()
    if mime not in MIME_SOPORTADOS:
        # PDFs y otros formatos no van por vision: que el caller use el fallback.
        return None

    imagen_b64 = base64.b64encode(file_path.read_bytes()).decode("ascii")
    texto = IMAGE_SYSTEM_PROMPT
    if descripcion:
        texto += f"\nContexto clinico aportado por el usuario: {descripcion}"

    def _run() -> dict:
        resp = client.chat.completions.create(
            model=settings.openai_vision_model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": IMAGE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": texto},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{imagen_b64}"},
                        },
                    ],
                },
            ],
        )
        return json_from_text(resp.choices[0].message.content or "{}")

    data = await asyncio.to_thread(_run)
    return build_image_result(data, proveedor="openai")
