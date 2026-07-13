"""Cadena de proveedores de IA con degradacion progresiva.

Orden configurable con IA_PROVIDER_ORDER (por defecto "gemini,openai").
Se intenta cada proveedor en orden; si uno no tiene clave o falla, se pasa al
siguiente. Si ninguno responde, se usa el analisis por reglas locales, de modo
que el endpoint NUNCA rompe el flujo del usuario.

Esto permite operar solo con OpenAI (sin clave de Gemini), solo con Gemini, con
ambos (uno como respaldo del otro) o con ninguno (modo reglas, solo demo).
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.config import Settings
from app.schemas import ChatTriajeResponse
from app.services.gemini import gemini_image_analysis, gemini_triage
from app.services.openai_ia import openai_image_analysis, openai_triage
from app.services.rules import fallback_image_analysis, rule_based_triage

log = logging.getLogger(__name__)


def _tiene_clave(settings: Settings, proveedor: str) -> bool:
    if proveedor == "gemini":
        return bool(settings.gemini_api_key)
    if proveedor == "openai":
        return bool(settings.openai_api_key)
    return False


def proveedor_activo(settings: Settings) -> str:
    """Primer proveedor con clave configurada, o 'reglas-locales' si no hay ninguno.
    Se expone en /health para diagnosticar de un vistazo por que una respuesta
    llego con baja confianza."""
    for proveedor in settings.ia_provider_list:
        if _tiene_clave(settings, proveedor):
            return proveedor
    return "reglas-locales"


async def analizar_triaje(
    settings: Settings,
    mensaje: str,
    historial: list[dict[str, str]],
) -> ChatTriajeResponse:
    for proveedor in settings.ia_provider_list:
        if not _tiene_clave(settings, proveedor):
            continue
        try:
            if proveedor == "gemini":
                resultado = await gemini_triage(settings, mensaje, historial)
            elif proveedor == "openai":
                resultado = await openai_triage(settings, mensaje, historial)
            else:
                continue
            if resultado is not None:
                return resultado
        except Exception as exc:  # el proveedor fallo: probamos el siguiente
            log.warning("Proveedor de triaje '%s' fallo: %s", proveedor, exc)

    return rule_based_triage(mensaje)


async def analizar_imagen(
    settings: Settings,
    ruta: Path,
    content_type: str | None,
    descripcion: str | None,
    nombre_original: str,
) -> dict:
    for proveedor in settings.ia_provider_list:
        if not _tiene_clave(settings, proveedor):
            continue
        try:
            if proveedor == "gemini":
                resultado = await gemini_image_analysis(settings, ruta, content_type, descripcion)
            elif proveedor == "openai":
                resultado = await openai_image_analysis(settings, ruta, content_type, descripcion)
            else:
                continue
            if resultado is not None:
                return resultado
        except Exception as exc:
            log.warning("Proveedor de imagen '%s' fallo: %s", proveedor, exc)

    return fallback_image_analysis(nombre_original, content_type)
