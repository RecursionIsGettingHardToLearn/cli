"""
Pruebas Unitarias — ms-diagnostico-ia / storage.py
====================================================
Funciones testeadas (src: microservicios/ms-diagnostico-ia/app/services/storage.py):
  - _iso              : convierte datetime → str ISO o None
  - _parse_datetime   : parsea strings ISO a datetime
  - _new_id           : genera IDs enteros únicos positivos
  - _uses_dynamodb    : detecta si la config apunta a DynamoDB/S3
  - DocumentoRecord   : dataclass de documento clínico
  - ResultadoRecord   : dataclass de resultado de análisis IA

Ejecución:
    cd microservicios/ms-diagnostico-ia
    pytest ../../tests/unitarias/ms_diagnostico_ia/test_storage_helpers.py -v
"""

import sys
import os
import pytest
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../../microservicios/ms-diagnostico-ia"))

from app.services.storage import (
    DocumentoRecord,
    ResultadoRecord,
    _iso,
    _parse_datetime,
    _new_id,
    _uses_dynamodb,
)
from app.config import Settings


# ─────────────────────────── _iso ─────────────────────────────────────

class TestIso:
    def test_datetime_con_tz_se_convierte(self):
        dt = datetime(2026, 7, 28, 12, 0, 0, tzinfo=timezone.utc)
        result = _iso(dt)
        assert "2026" in result
        assert "07" in result or "7" in result

    def test_none_devuelve_none(self):
        assert _iso(None) is None

    def test_resultado_es_string(self):
        dt = datetime(2026, 1, 1, tzinfo=timezone.utc)
        assert isinstance(_iso(dt), str)


# ─────────────────────────── _parse_datetime ──────────────────────────

class TestParseDatetime:
    def test_formato_iso_z(self):
        result = _parse_datetime("2026-07-28T18:56:17Z")
        assert isinstance(result, datetime)

    def test_formato_iso_con_offset(self):
        result = _parse_datetime("2026-07-28T18:56:17+00:00")
        assert isinstance(result, datetime)
        assert result.year == 2026

    def test_none_devuelve_none(self):
        assert _parse_datetime(None) is None

    def test_string_invalido_devuelve_none(self):
        assert _parse_datetime("no-es-fecha") is None

    def test_string_vacio_devuelve_none(self):
        assert _parse_datetime("") is None


# ─────────────────────────── _new_id ──────────────────────────────────

class TestNewId:
    def test_devuelve_entero(self):
        assert isinstance(_new_id(), int)

    def test_valor_positivo(self):
        assert _new_id() > 0

    def test_ids_consecutivos_distintos(self):
        """Cada llamada debe producir un ID diferente."""
        ids = {_new_id() for _ in range(20)}
        assert len(ids) == 20


# ─────────────────────────── _uses_dynamodb ───────────────────────────

class TestUsesDynamodb:
    def test_backend_dynamodb_devuelve_true(self):
        cfg = Settings(storage_backend="dynamodb", openai_api_key="sk-test")
        assert _uses_dynamodb(cfg) is True

    def test_backend_sqlite_devuelve_false(self):
        cfg = Settings(storage_backend="sqlite", openai_api_key="sk-test")
        assert _uses_dynamodb(cfg) is False

    def test_backend_vacio_devuelve_false(self):
        cfg = Settings(storage_backend="", openai_api_key="sk-test")
        assert _uses_dynamodb(cfg) is False


# ─────────────────────────── DocumentoRecord ──────────────────────────

class TestDocumentoRecord:
    def _doc(self, **kw):
        defaults = dict(
            id=1,
            paciente_id="pac-uuid-001",
            nombre_original="radiografia_torax.jpg",
            content_type="image/jpeg",
            ruta="/data/uploads/radiografia_torax.jpg",
            tamano_bytes=8409,
            s3_bucket=None,
            s3_key=None,
            creado_en=datetime(2026, 7, 28, tzinfo=timezone.utc),
        )
        defaults.update(kw)
        return DocumentoRecord(**defaults)

    def test_creacion_basica(self):
        doc = self._doc()
        assert doc.id == 1
        assert doc.paciente_id == "pac-uuid-001"
        assert doc.nombre_original == "radiografia_torax.jpg"

    def test_con_s3(self):
        doc = self._doc(s3_bucket="clinica-archivos", s3_key="uploads/radiografia_torax.jpg")
        assert doc.s3_bucket == "clinica-archivos"
        assert doc.s3_key is not None

    def test_tamano_positivo(self):
        doc = self._doc(tamano_bytes=161812)
        assert doc.tamano_bytes > 0

    def test_content_type_imagen(self):
        doc = self._doc(content_type="image/png")
        assert "image" in doc.content_type


# ─────────────────────────── ResultadoRecord ──────────────────────────

class TestResultadoRecord:
    def _res(self, **kw):
        defaults = dict(
            id=10,
            paciente_id="pac-uuid-001",
            documento_id=1,
            tipo="analisis_imagen",
            proveedor="openai",
            resultado={
                "clasificacion": "Normal",
                "probabilidad": 0.70,
                "score_anomalia": 0.18,
                "es_anomalo": False,
                "urgencia": "BAJA",
            },
            estado_revision="PENDIENTE",
            decision_medica=None,
            creado_en=datetime(2026, 7, 28, tzinfo=timezone.utc),
        )
        defaults.update(kw)
        return ResultadoRecord(**defaults)

    def test_tipo_analisis_imagen(self):
        r = self._res()
        assert r.tipo == "analisis_imagen"

    def test_estado_pendiente_por_defecto(self):
        r = self._res()
        assert r.estado_revision == "PENDIENTE"

    def test_resultado_es_dict(self):
        r = self._res()
        assert isinstance(r.resultado, dict)

    def test_resultado_contiene_clasificacion(self):
        r = self._res()
        assert "clasificacion" in r.resultado

    def test_proveedor_openai(self):
        r = self._res()
        assert r.proveedor == "openai"

    def test_estado_confirmado(self):
        r = self._res(estado_revision="CONFIRMADO", decision_medica="El medico confirma el hallazgo.")
        assert r.estado_revision == "CONFIRMADO"
        assert r.decision_medica is not None
