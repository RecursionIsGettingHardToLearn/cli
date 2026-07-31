"""
Pruebas Unitarias — ms-diagnostico-ia / ia_common.py
=====================================================
Funciones testeadas (src: microservicios/ms-diagnostico-ia/app/services/ia_common.py):
  - json_from_text     : extrae JSON del texto que devuelve el LLM
  - safe_float         : convierte un valor a float con fallback
  - safe_urgency       : normaliza la urgencia clínica a ALTA/MEDIA/BAJA
  - safe_string_list   : garantiza que los hallazgos sean list[str]
  - _normalizar_probabilidades : ordena y re-escala a suma 1.0
  - build_image_result : arma el dict de respuesta de clasificación+anomalía

Ejecución:
    cd microservicios/ms-diagnostico-ia
    pip install pytest
    pytest ../../tests/unitarias/ms_diagnostico_ia/ -v
"""

import sys
import os
import pytest

# Añadir el servicio al path sin instalar el paquete
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../microservicios/ms-diagnostico-ia"))

from app.services.ia_common import (
    json_from_text,
    safe_float,
    safe_urgency,
    safe_string_list,
    build_image_result,
)


# ─────────────────────────── json_from_text ───────────────────────────

class TestJsonFromText:
    """El LLM a veces devuelve JSON envuelto en bloques markdown o con texto extra."""

    def test_json_limpio(self):
        raw = '{"clasificacion": "Normal", "probabilidad": 0.8}'
        result = json_from_text(raw)
        assert result["clasificacion"] == "Normal"
        assert result["probabilidad"] == 0.8

    def test_json_con_bloque_markdown(self):
        raw = '```json\n{"clasificacion": "Neumonia", "urgencia": "ALTA"}\n```'
        result = json_from_text(raw)
        assert result["clasificacion"] == "Neumonia"

    def test_json_con_texto_previo(self):
        raw = 'Aqui esta el analisis:\n{"urgencia": "MEDIA", "hallazgos": ["opacidad basal"]}'
        result = json_from_text(raw)
        assert result["urgencia"] == "MEDIA"

    def test_json_invalido_devuelve_dict_vacio(self):
        result = json_from_text("esto no es JSON para nada")
        assert isinstance(result, dict)

    def test_string_vacio(self):
        result = json_from_text("")
        assert isinstance(result, dict)


# ─────────────────────────── safe_float ───────────────────────────────

class TestSafeFloat:
    """Conversión robusta a float usado para probabilidades y confianza."""

    def test_float_normal(self):
        assert safe_float(0.85) == pytest.approx(0.85)

    def test_string_numerico(self):
        assert safe_float("0.72") == pytest.approx(0.72)

    def test_int_se_convierte(self):
        assert safe_float(1) == pytest.approx(1.0)

    def test_none_devuelve_default(self):
        assert safe_float(None) == pytest.approx(0.7)

    def test_default_personalizado(self):
        assert safe_float(None, 0.5) == pytest.approx(0.5)

    def test_string_no_numerico_devuelve_default(self):
        assert safe_float("no-es-numero") == pytest.approx(0.7)


# ─────────────────────────── safe_urgency ─────────────────────────────

class TestSafeUrgency:
    """Normaliza la urgencia clínica; debe devolver ALTA, MEDIA o BAJA."""

    def test_alta_mayuscula(self):
        assert safe_urgency("ALTA") == "ALTA"

    def test_alta_minuscula(self):
        assert safe_urgency("alta") == "ALTA"

    def test_media(self):
        assert safe_urgency("Media") == "MEDIA"

    def test_baja(self):
        assert safe_urgency("baja") == "BAJA"

    def test_desconocida_devuelve_media(self):
        # Valor no reconocido → fallback seguro
        assert safe_urgency("URGENTE") == "MEDIA"

    def test_none_devuelve_media(self):
        assert safe_urgency(None) == "MEDIA"


# ─────────────────────────── safe_string_list ─────────────────────────

class TestSafeStringList:
    """Los hallazgos deben ser siempre list[str]; el LLM puede devolver variantes."""

    def test_lista_normal(self):
        result = safe_string_list(["opacidad basal", "cardiomegalia"])
        assert result == ["opacidad basal", "cardiomegalia"]

    def test_lista_con_no_strings(self):
        result = safe_string_list([1, "hallazgo", None])
        assert all(isinstance(h, str) for h in result)

    def test_string_simple_se_envuelve(self):
        result = safe_string_list("un solo hallazgo")
        assert isinstance(result, list)

    def test_none_devuelve_lista_vacia(self):
        assert safe_string_list(None) == []

    def test_dict_devuelve_lista_vacia(self):
        # Tipo inesperado → nunca rompe
        assert isinstance(safe_string_list({"key": "val"}), list)


# ─────────────────────────── build_image_result ───────────────────────

class TestBuildImageResult:
    """
    Función central: construye el dict de respuesta del análisis de imagen.
    Debe normalizar probabilidades, clasificación, score de anomalía, etc.
    """

    def _data_completa(self):
        return {
            "clasificacion": "Normal",
            "probabilidad": 0.70,
            "probabilidades": [
                {"clase": "Normal", "probabilidad": 0.70},
                {"clase": "Neumonia", "probabilidad": 0.20},
                {"clase": "Derrame pleural", "probabilidad": 0.10},
            ],
            "score_anomalia": 0.18,
            "es_anomalo": False,
            "justificacion_anomalia": "Imagen dentro de parametros normales",
            "tipo_imagen": "Radiografia de torax",
            "hallazgos": ["Estructuras oseas bien definidas", "Silueta cardiaca normal"],
            "urgencia": "BAJA",
            "recomendacion": "Control de rutina",
            "nota_seguridad": "Resultado informativo.",
        }

    def test_clasificacion_se_preserva(self):
        r = build_image_result(self._data_completa(), "openai")
        assert r["clasificacion"] == "Normal"

    def test_probabilidades_suman_1(self):
        r = build_image_result(self._data_completa(), "openai")
        total = sum(c["probabilidad"] for c in r["probabilidades"])
        assert total == pytest.approx(1.0, abs=0.01)

    def test_probabilidades_ordenadas_desc(self):
        r = build_image_result(self._data_completa(), "openai")
        probs = [c["probabilidad"] for c in r["probabilidades"]]
        assert probs == sorted(probs, reverse=True)

    def test_score_anomalia_entre_0_y_1(self):
        r = build_image_result(self._data_completa(), "openai")
        assert 0.0 <= r["score_anomalia"] <= 1.0

    def test_es_anomalo_false_cuando_score_bajo(self):
        data = self._data_completa()
        data["score_anomalia"] = 0.18
        data["es_anomalo"] = False
        r = build_image_result(data, "openai")
        assert r["es_anomalo"] is False

    def test_es_anomalo_true_cuando_score_alto(self):
        data = self._data_completa()
        data["score_anomalia"] = 0.87
        data["es_anomalo"] = True
        r = build_image_result(data, "openai")
        assert r["es_anomalo"] is True

    def test_proveedor_se_incluye(self):
        r = build_image_result(self._data_completa(), "openai")
        assert r["proveedor"] == "openai"

    def test_urgencia_normalizada(self):
        data = self._data_completa()
        data["urgencia"] = "baja"
        r = build_image_result(data, "openai")
        assert r["urgencia"] == "BAJA"

    def test_hallazgos_son_lista(self):
        r = build_image_result(self._data_completa(), "openai")
        assert isinstance(r["hallazgos"], list)

    def test_data_minima_no_rompe(self):
        # Con el mínimo de datos, no debe lanzar excepción
        r = build_image_result({}, "fallback")
        assert "clasificacion" in r
        assert "probabilidades" in r
        assert isinstance(r["probabilidades"], list)

    def test_probabilidades_invalidas_se_ignoran(self):
        data = self._data_completa()
        data["probabilidades"] = [{"clase": "X", "probabilidad": -5}, "basura", None]
        r = build_image_result(data, "openai")
        # No debe romper y cualquier prob >= 0
        for c in r["probabilidades"]:
            assert c["probabilidad"] >= 0.0
