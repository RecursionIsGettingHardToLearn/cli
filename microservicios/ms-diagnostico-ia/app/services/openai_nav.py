"""Asistente de navegacion del frontend (chatbot flotante).

Recibe el mensaje del usuario + el catalogo de rutas que SU ROL puede ver
(el frontend lo manda ya filtrado) y devuelve una respuesta corta y, si
corresponde, la ruta a la que hay que navegar.

Mismo espiritu que el resto del servicio:
- Con OPENAI_API_KEY -> chat.completions con response_format JSON.
- Sin clave (o si OpenAI falla) -> degradacion a reglas locales por keywords,
  asi el widget sigue siendo util en demos sin gastar credito.

La ruta que devuelve el modelo se valida SIEMPRE contra el catalogo recibido:
si alucina un path que no existe, se descarta (navegar_a = None).
"""
from __future__ import annotations

import asyncio
import json
import unicodedata

from app.config import Settings
from app.schemas import ChatAsistenteRequest, ChatAsistenteResponse, RutaApp


def _client(settings: Settings):
    """Cliente OpenAI solo si hay clave. Import perezoso (igual que openai_ia)."""
    if not settings.openai_api_key:
        return None
    try:
        from openai import OpenAI
    except Exception:
        return None
    return OpenAI(api_key=settings.openai_api_key)


def _rol_openai(rol: str) -> str:
    return "assistant" if str(rol).lower() in {"assistant", "ia", "bot", "asistente"} else "user"


def _normalizar(texto: str) -> str:
    """minusculas + sin tildes, para comparar keywords sin sorpresas."""
    plano = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in plano if unicodedata.category(c) != "Mn")


def _catalogo_texto(rutas: list[RutaApp]) -> str:
    lineas = []
    for r in rutas:
        desc = f" - {r.descripcion}" if r.descripcion else ""
        lineas.append(f"- {r.path} | {r.titulo}{desc}")
    return "\n".join(lineas) if lineas else "(sin rutas disponibles)"


def _system_prompt(rol: str | None, rutas: list[RutaApp]) -> str:
    return (
        "Eres el asistente integrado de MediCloud, un sistema web de gestion clinica. "
        "Tienes dos funciones: (1) ayudar al usuario a navegar por la aplicacion y "
        "explicarle que puede hacer en cada seccion, y (2) responder brevemente dudas "
        "generales de conversacion.\n\n"
        f"El usuario tiene el rol: {rol or 'desconocido'}. "
        "Estas son las UNICAS secciones a las que puede acceder:\n"
        f"{_catalogo_texto(rutas)}\n\n"
        "REGLAS ESTRICTAS:\n"
        "1. Responde SIEMPRE en espanol, en 1 a 3 frases, tono amable y directo.\n"
        '2. Devuelve UNICAMENTE un JSON valido con esta forma exacta: '
        '{"respuesta": "texto para el usuario", "navegar_a": "/ruta-exacta" }. '
        'Si no corresponde navegar, usa null en "navegar_a".\n'
        "3. Usa navegar_a SOLO si el usuario pide ir, abrir, ver o buscar una seccion, "
        "y SOLO con un path que aparezca literalmente en la lista de arriba.\n"
        "4. Nunca inventes rutas ni menciones secciones que no esten en la lista.\n"
        "5. No des diagnosticos ni consejos medicos: si preguntan por sintomas o salud, "
        "orienta a la seccion de Pre-triaje o Citas cuando esten en su lista.\n"
    )


async def _asistir_openai(
    settings: Settings, payload: ChatAsistenteRequest
) -> ChatAsistenteResponse | None:
    client = _client(settings)
    if client is None:
        return None

    mensajes: list[dict] = [
        {"role": "system", "content": _system_prompt(payload.rol_usuario, payload.rutas)}
    ]
    for item in payload.historial[-8:]:
        contenido = item.get("contenido", "") or item.get("texto", "")
        if contenido:
            mensajes.append(
                {"role": _rol_openai(item.get("rol", "user")), "content": contenido}
            )
    mensajes.append({"role": "user", "content": payload.mensaje})

    def _run() -> dict:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.4,
            max_tokens=300,
            response_format={"type": "json_object"},
            messages=mensajes,
        )
        try:
            return json.loads(resp.choices[0].message.content or "{}")
        except json.JSONDecodeError:
            return {"respuesta": (resp.choices[0].message.content or "").strip()}

    try:
        data = await asyncio.to_thread(_run)
    except Exception:
        # Cualquier fallo del proveedor degrada a reglas locales (no reventamos).
        return None

    respuesta = str(data.get("respuesta") or "").strip()
    if not respuesta:
        return None

    navegar_a = data.get("navegar_a")
    paths_validos = {r.path for r in payload.rutas}
    if navegar_a not in paths_validos:
        navegar_a = None  # el modelo alucino o devolvio basura: se descarta

    return ChatAsistenteResponse(respuesta=respuesta, navegar_a=navegar_a, proveedor="openai")


def _asistir_reglas(payload: ChatAsistenteRequest) -> ChatAsistenteResponse:
    """Fallback sin IA: matching de keywords contra titulo/descripcion/path."""
    consulta = _normalizar(payload.mensaje)
    palabras = {p for p in consulta.replace("/", " ").split() if len(p) >= 3}

    mejor: RutaApp | None = None
    mejor_puntaje = 0
    for ruta in payload.rutas:
        indice = _normalizar(f"{ruta.path} {ruta.titulo} {ruta.descripcion}")
        puntaje = sum(1 for p in palabras if p in indice)
        if puntaje > mejor_puntaje:
            mejor, mejor_puntaje = ruta, puntaje

    quiere_navegar = any(
        v in consulta for v in ("ir", "lleva", "llevame", "abre", "abrir", "muestra",
                                "mostrar", "ver", "donde", "entrar", "navega", "busco")
    )

    if mejor and (quiere_navegar or mejor_puntaje >= 2):
        return ChatAsistenteResponse(
            respuesta=f"Te llevo a {mejor.titulo}. {mejor.descripcion}".strip(),
            navegar_a=mejor.path,
            proveedor="reglas-locales",
        )

    titulos = ", ".join(r.titulo for r in payload.rutas[:8])
    return ChatAsistenteResponse(
        respuesta=(
            "Puedo ayudarte a moverte por MediCloud. Con tu rol puedes acceder a: "
            f"{titulos}. Dime a donde quieres ir, por ejemplo: 'llevame a mis citas'."
        ),
        navegar_a=None,
        proveedor="reglas-locales",
    )


async def asistir_navegacion(
    settings: Settings, payload: ChatAsistenteRequest
) -> ChatAsistenteResponse:
    """Punto de entrada: intenta OpenAI y degrada a reglas locales."""
    resultado = await _asistir_openai(settings, payload)
    if resultado is not None:
        return resultado
    return _asistir_reglas(payload)
