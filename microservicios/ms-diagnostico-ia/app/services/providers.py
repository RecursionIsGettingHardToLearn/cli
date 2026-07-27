"""Cadena de proveedores de IA con degradacion progresiva.

Hoy el unico proveedor es OpenAI. Si no tiene clave o falla, se usa el analisis
por reglas locales, de modo que el endpoint NUNCA rompe el flujo del usuario.

Se conserva la forma de "cadena" (recorre IA_PROVIDER_ORDER) para poder sumar
otro proveedor en el futuro sin reescribir los endpoints.
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.config import Settings
from app.schemas import ChatTriajeResponse
from app.services.openai_ia import openai_image_analysis, openai_triage
from app.services.rules import fallback_image_analysis, rule_based_triage

log = logging.getLogger(__name__)


def _tiene_clave(settings: Settings, proveedor: str) -> bool:
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
            if proveedor == "openai":
                resultado = await openai_triage(settings, mensaje, historial)
            else:
                continue
            if resultado is not None:
                return resultado
        except Exception as exc:  # el proveedor fallo: caemos a reglas locales
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
            if proveedor == "openai":
                resultado = await openai_image_analysis(settings, ruta, content_type, descripcion)
            else:
                continue
            if resultado is not None:
                return resultado
        except Exception as exc:
            log.warning("Proveedor de imagen '%s' fallo: %s", proveedor, exc)

    return fallback_image_analysis(nombre_original, content_type)
