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
import re
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
        icono = f" (icono {r.icono})" if r.icono else ""
        desc = f" - {r.descripcion}" if r.descripcion else ""
        lineas.append(f"- {r.path} | item del menu: '{r.titulo}'{icono}{desc}")
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
        "COMO ES LA INTERFAZ (para que puedas guiar):\n"
        "- A la izquierda hay un menu lateral (sidebar) verde con los items de arriba, "
        "cada uno con su icono y nombre.\n"
        "- En pantallas pequenas el menu esta oculto: se abre con el boton de tres "
        "lineas (hamburguesa) arriba a la izquierda.\n"
        "- Cuando tu respuesta incluye navegar_a, el chat muestra un boton 'Ir a...' "
        "en el que el usuario puede hacer clic, y al llegar se resalta el item del menu.\n\n"
        "REGLAS ESTRICTAS:\n"
        "1. Responde SIEMPRE en espanol, en 1 a 3 frases, tono amable y directo.\n"
        '2. Devuelve UNICAMENTE un JSON valido con esta forma exacta: '
        '{"respuesta": "texto para el usuario", "navegar_a": "/ruta-exacta", '
        '"guia": ["paso 1", "paso 2"]}. '
        'Si no corresponde navegar, usa null en "navegar_a". Si no corresponde guiar, '
        'usa [] en "guia".\n'
        "3. Usa navegar_a cuando el usuario quiera ir, abrir, ver o encontrar una "
        "seccion, SOLO con un path que aparezca literalmente en la lista de arriba.\n"
        "4. Llena guia (2 o 3 pasos, cortos) cuando el usuario este perdido o pregunte "
        "COMO llegar, DONDE esta algo o diga que no encuentra una seccion: los pasos "
        "explican el camino manual por el menu lateral citando el nombre EXACTO del "
        "item y mencionando el boton hamburguesa si aplica. En ese caso incluye "
        "TAMBIEN navegar_a para ofrecer el atajo con boton.\n"
        "5. Nunca inventes rutas ni menciones secciones que no esten en la lista.\n"
        "6. No des diagnosticos ni consejos medicos: si preguntan por sintomas o salud, "
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

    guia_cruda = data.get("guia") or []
    guia = [str(p).strip()[:200] for p in guia_cruda if str(p).strip()][:4] \
        if isinstance(guia_cruda, list) else []

    return ChatAsistenteResponse(
        respuesta=respuesta, navegar_a=navegar_a, guia=guia, proveedor="openai"
    )


def _asistir_reglas(payload: ChatAsistenteRequest) -> ChatAsistenteResponse:
    """Fallback sin IA: matching de keywords contra titulo/descripcion/path."""
    consulta = _normalizar(payload.mensaje)
    # \w+ sobre el texto ya normalizado: fuera comas, signos y barras, que si no
    # "reportes," no matchea contra "reportes".
    palabras = {p for p in re.findall(r"[a-z0-9]+", consulta) if len(p) >= 3}

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
    quiere_guia = any(
        v in consulta for v in ("como llego", "como voy", "como entro", "donde esta",
                                "donde queda", "no encuentro", "no se llegar", "guia",
                                "perdido", "perdida", "como accedo")
    )

    if mejor and (quiere_navegar or quiere_guia or mejor_puntaje >= 2):
        guia: list[str] = []
        if quiere_guia:
            icono = f" (icono {mejor.icono})" if mejor.icono else ""
            guia = [
                "Abre el menu lateral; en pantallas pequenas usa el boton de tres "
                "lineas arriba a la izquierda.",
                f"Busca el item '{mejor.titulo}'{icono} y haz clic.",
                "O usa el boton 'Ir a...' aqui abajo para llegar directo.",
            ]
        return ChatAsistenteResponse(
            respuesta=f"Te llevo a {mejor.titulo}. {mejor.descripcion}".strip(),
            navegar_a=mejor.path,
            guia=guia,
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
