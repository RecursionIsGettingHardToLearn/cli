from app.schemas import ChatTriajeResponse


SPECIALTY_KEYWORDS = {
    "DERMATOLOGIA": ["piel", "roncha", "mancha", "lesion", "herida", "picazon", "lunar", "sarpullido"],
    "CARDIOLOGIA": ["pecho", "palpitacion", "corazon", "presion", "dolor toracico"],
    "NEUMOLOGIA": ["tos", "respirar", "falta de aire", "pulmon", "asma", "flema"],
    "GASTROENTEROLOGIA": ["estomago", "vomito", "diarrea", "nausea", "abdomen", "gastritis"],
    "TRAUMATOLOGIA": ["golpe", "fractura", "torcedura", "caida", "dolor de rodilla", "hueso"],
    "PEDIATRIA": ["niño", "nino", "bebe", "hijo", "hija", "fiebre infantil"],
}

ALARM_KEYWORDS = [
    "dificultad para respirar",
    "dolor fuerte en el pecho",
    "desmayo",
    "convulsion",
    "sangrado abundante",
    "paralisis",
    "confusion",
]


def rule_based_triage(message: str) -> ChatTriajeResponse:
    normalized = message.lower()
    specialty = "MEDICINA_GENERAL"
    confidence = 0.55

    for candidate, keywords in SPECIALTY_KEYWORDS.items():
        if any(keyword in normalized for keyword in keywords):
            specialty = candidate
            confidence = 0.72
            break

    alarmas = [word for word in ALARM_KEYWORDS if word in normalized]
    urgency = "ALTA" if alarmas else "MEDIA" if any(w in normalized for w in ["fiebre", "dolor", "mareo"]) else "BAJA"

    return ChatTriajeResponse(
        respuesta=(
            "Por los sintomas descritos, te recomiendo orientarte por "
            f"{specialty.replace('_', ' ').title()}. Esta es una orientacion inicial y no reemplaza "
            "la evaluacion de un medico."
        ),
        especialidad=specialty,
        urgencia=urgency,
        agendar=True,
        confianza=confidence,
        proveedor="reglas-locales",
        signos_alarma=alarmas,
        recomendaciones=[
            "Agenda una cita si los sintomas persisten o empeoran.",
            "Acude a emergencias si aparece dificultad respiratoria, dolor toracico intenso o desmayo.",
        ],
    )


def fallback_image_analysis(filename: str, content_type: str | None) -> dict:
    image_kind = "imagen_clinica" if content_type and content_type.startswith("image/") else "documento"
    return {
        "proveedor": "reglas-locales",
        "tipo_imagen": image_kind,
        "hallazgos": [
            "Archivo recibido correctamente.",
            "Analisis visual avanzado no disponible sin proveedor multimodal configurado.",
        ],
        "urgencia": "MEDIA",
        "recomendacion": "Derivar a revision medica. Adjuntar descripcion clinica para mejorar el triaje.",
        "confianza": 0.35,
        "nota_seguridad": "Resultado informativo. No usar como diagnostico definitivo.",
    }

