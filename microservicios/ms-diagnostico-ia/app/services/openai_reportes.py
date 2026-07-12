"""Reportes con IA por voz (OpenAI).

Dos pasos:
  1. transcribir_audio: Whisper convierte el audio en texto.
  2. generar_plan_reporte: un modelo de chat (gpt-4o-mini por defecto) recibe la
     consulta + el catalogo de fuentes/columnas que el rol puede ver y devuelve
     un "plan" en JSON: que fuente usar, que columnas, un titulo y un analisis
     en lenguaje natural. La IA NUNCA ve datos de pacientes: solo el catalogo de
     columnas y la consulta hablada; el movil ejecuta la consulta real contra el
     gateway GraphQL con el JWT del usuario.

Si no hay OPENAI_API_KEY configurada, hay un fallback por reglas para que el
endpoint nunca rompa el flujo (igual que el triaje con su clasificador local).
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from app.config import Settings


def _client(settings: Settings):
    if not settings.openai_api_key:
        return None
    try:
        from openai import OpenAI
    except Exception:
        return None
    return OpenAI(api_key=settings.openai_api_key)


# ---------------------------------------------------------------------------
# 1) Transcripcion (Whisper)
# ---------------------------------------------------------------------------
async def transcribir_audio(settings: Settings, audio_path: Path) -> str:
    client = _client(settings)
    if client is None:
        return ""

    def _run() -> str:
        with open(audio_path, "rb") as fh:
            tr = client.audio.transcriptions.create(
                model=settings.openai_transcribe_model,
                file=fh,
            )
        return getattr(tr, "text", "") or ""

    try:
        return (await asyncio.to_thread(_run)).strip()
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# 2) Plan del reporte (chat)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
Eres un asistente de reportes para un sistema de gestion de una clinica/farmacia.
Recibes: el ROL del usuario, una CONSULTA en lenguaje natural y un CATALOGO de
fuentes de datos disponibles (cada una con un id y una lista de columnas {key,label}).
Tu tarea es elegir la fuente mas adecuada para responder la consulta y redactar un
analisis breve y util en espanol.

Reglas:
- "fuente" DEBE ser uno de los id del catalogo, o null si ninguna aplica.
- "columnas" es una lista de "key" existentes en esa fuente (subconjunto razonable
  segun la consulta); si no estas seguro, devuelve [] para incluir todas.
- "titulo" corto y descriptivo.
- "narrativa": 2 a 4 frases. Como NO ves los datos todavia, describe que mostrara
  el reporte y que deberia revisar el usuario; no inventes cifras concretas.
- Responde UNICAMENTE un objeto JSON con las claves: titulo, narrativa, fuente, columnas.
"""


def _fallback_plan(consulta: str, catalogo: list[dict[str, Any]]) -> dict[str, Any]:
    """Sin OpenAI: heuristica simple por coincidencia de palabras."""
    texto = (consulta or "").lower()
    elegido = None
    mejor = 0
    for fuente in catalogo:
        etiqueta = str(fuente.get("label", "")).lower()
        score = sum(1 for palabra in etiqueta.split() if palabra and palabra in texto)
        if score > mejor:
            mejor = score
            elegido = fuente
    if elegido is None and catalogo:
        elegido = catalogo[0]
    titulo = f"Reporte: {elegido['label']}" if elegido else "Reporte"
    narr = (
        "Generado sin asistente de IA (no hay clave de OpenAI configurada en el "
        "servidor). Se muestra la fuente que mejor coincide con tu consulta; puedes "
        "ajustar las columnas en el modo de reportes dinamicos."
    )
    return {
        "titulo": titulo,
        "narrativa": narr,
        "fuente": elegido["id"] if elegido else None,
        "columnas": [],
    }


def _normalizar(plan: dict[str, Any], catalogo: list[dict[str, Any]]) -> dict[str, Any]:
    ids = {f["id"]: {c["key"] for c in f.get("campos", [])} for f in catalogo}
    fuente = plan.get("fuente")
    if fuente not in ids:
        fuente = None
    columnas = plan.get("columnas") or []
    if fuente and isinstance(columnas, list):
        validas = ids[fuente]
        columnas = [str(k) for k in columnas if str(k) in validas]
    else:
        columnas = []
    return {
        "titulo": str(plan.get("titulo") or "Reporte con IA"),
        "narrativa": str(plan.get("narrativa") or ""),
        "fuente": fuente,
        "columnas": columnas,
    }


async def generar_plan_reporte(
    settings: Settings,
    consulta: str,
    catalogo: list[dict[str, Any]],
    rol: str,
) -> dict[str, Any]:
    client = _client(settings)
    if client is None or not consulta.strip():
        plan = _fallback_plan(consulta, catalogo)
        plan["proveedor"] = "fallback"
        return plan

    payload = {
        "rol": rol,
        "consulta": consulta,
        "catalogo": [
            {
                "id": f["id"],
                "label": f.get("label"),
                "columnas": [
                    {"key": c["key"], "label": c.get("label")} for c in f.get("campos", [])
                ],
            }
            for f in catalogo
        ],
    }

    def _run() -> dict[str, Any]:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
        )
        return json.loads(resp.choices[0].message.content or "{}")

    try:
        plan = _normalizar(await asyncio.to_thread(_run), catalogo)
        plan["proveedor"] = "openai"
        return plan
    except Exception:
        plan = _fallback_plan(consulta, catalogo)
        plan["proveedor"] = "fallback"
        return plan
