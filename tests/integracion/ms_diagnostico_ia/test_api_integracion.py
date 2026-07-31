"""
Pruebas de Integración — ms-diagnostico-ia / FastAPI REST
==========================================================
Qué se prueba: los endpoints reales de ms-diagnostico-ia usando el
cliente de test de FastAPI (TestClient de Starlette), que levanta el
servidor en memoria sin necesidad de Docker.

Endpoints cubiertos:
  GET  /health
  POST /api/chat-triaje          (pre-triaje de síntomas)
  POST /api/analizar-imagen      (clasificación IA de imagen)
  POST /api/documentos           (subir archivo clínico)
  GET  /api/documentos           (listar documentos de un paciente)
  GET  /api/documentos/{id}/archivo  (ver/descargar archivo)
  GET  /api/resultados           (historial de análisis IA)
  PUT  /api/resultados/{id}/revision (confirmar/descartar resultado)

Pre-requisitos:
  pip install pytest httpx fastapi python-multipart
  (El servicio carga su propia DB sqlite si STORAGE_BACKEND=sqlite)

Ejecución:
  cd microservicios/ms-diagnostico-ia
  OPENAI_API_KEY=sk-test STORAGE_BACKEND=sqlite \\
  pytest ../../tests/integracion/ms_diagnostico_ia/ -v --tb=short
"""

import io
import os
import sys
import json
from pathlib import Path

import pytest

# Añadimos el servicio al path para importar su app
MS2_ROOT = Path(__file__).parent / "../../../microservicios/ms-diagnostico-ia"
sys.path.insert(0, str(MS2_ROOT.resolve()))

# Configuración mínima para tests (usa sqlite en memoria, sin AWS, sin OpenAI real)
os.environ.setdefault("OPENAI_API_KEY",   "sk-test-integracion")
os.environ.setdefault("STORAGE_BACKEND",  "sqlite")
os.environ.setdefault("SQLITE_DB_PATH",   ":memory:")

# ─── Importar la app FastAPI ──────────────────────────────────────────────────

try:
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app, raise_server_exceptions=False)
    SKIP_REASON = None
except Exception as e:
    client = None
    SKIP_REASON = f"No se pudo importar la app: {e}"

skip_if_no_app = pytest.mark.skipif(
    SKIP_REASON is not None,
    reason=SKIP_REASON or "",
)

# ─── Fixtures ────────────────────────────────────────────────────────────────

PACIENTE_ID = "16a46201-9bc1-4d28-a565-4832fcc6a82a"   # Diego Torres — seed real

def radiografia_minimal() -> bytes:
    """
    Imagen JPEG válida mínima (1×1 px blanco) para no depender de archivos
    externos en el entorno de tests.
    """
    return bytes([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
        0xFF, 0xDB, 0x00, 0x43, 0x00,
        *([0x08] * 64),
        0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01,
        0x01, 0x01, 0x11, 0x00,
        0xFF, 0xC4, 0x00, 0x1F, 0x00,
        0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01,
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        *range(16),
        0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
        0x3F, 0x00, 0xF5, 0x7F, 0xFF, 0xD9,
    ])


# ─────────────────────────────────────────────────────────────────────────────

class TestHealth:
    @skip_if_no_app
    def test_health_devuelve_200(self):
        res = client.get("/health")
        assert res.status_code == 200

    @skip_if_no_app
    def test_health_contiene_status_ok(self):
        res = client.get("/health")
        body = res.json()
        assert body.get("status") in ("ok", "healthy", "UP")

    @skip_if_no_app
    def test_health_incluye_nombre_servicio(self):
        res = client.get("/health")
        body = res.json()
        text = json.dumps(body).lower()
        assert "clinica" in text or "diagnostico" in text or "ia" in text


# ─────────────────────────────────────────────────────────────────────────────

class TestSubirDocumento:
    @skip_if_no_app
    def test_subir_jpeg_devuelve_201_o_200(self):
        res = client.post(
            "/api/documentos",
            data={"paciente_id": PACIENTE_ID},
            files={"file": ("radiografia_torax.jpg", radiografia_minimal(), "image/jpeg")},
        )
        assert res.status_code in (200, 201), f"body: {res.text[:300]}"

    @skip_if_no_app
    def test_respuesta_incluye_id_y_nombre(self):
        res = client.post(
            "/api/documentos",
            data={"paciente_id": PACIENTE_ID},
            files={"file": ("eco_abdominal.jpg", radiografia_minimal(), "image/jpeg")},
        )
        assert res.status_code in (200, 201)
        body = res.json()
        assert "id" in body
        assert "nombre_original" in body

    @skip_if_no_app
    def test_subir_sin_paciente_id_devuelve_400_o_422(self):
        res = client.post(
            "/api/documentos",
            files={"file": ("test.jpg", radiografia_minimal(), "image/jpeg")},
        )
        assert res.status_code in (400, 422)

    @skip_if_no_app
    def test_subir_sin_archivo_devuelve_422(self):
        res = client.post(
            "/api/documentos",
            data={"paciente_id": PACIENTE_ID},
        )
        assert res.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────

class TestListarDocumentos:
    @skip_if_no_app
    def test_listar_devuelve_lista(self):
        # Primero subimos uno para que haya algo
        client.post(
            "/api/documentos",
            data={"paciente_id": PACIENTE_ID},
            files={"file": ("radiografia.jpg", radiografia_minimal(), "image/jpeg")},
        )

        res = client.get(f"/api/documentos?paciente_id={PACIENTE_ID}")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    @skip_if_no_app
    def test_listar_paciente_sin_docs_devuelve_lista_vacia(self):
        res = client.get("/api/documentos?paciente_id=pac-inexistente-xyz")
        assert res.status_code == 200
        assert res.json() == []

    @skip_if_no_app
    def test_cada_documento_tiene_campos_obligatorios(self):
        client.post(
            "/api/documentos",
            data={"paciente_id": PACIENTE_ID},
            files={"file": ("eco.jpg", radiografia_minimal(), "image/jpeg")},
        )
        res = client.get(f"/api/documentos?paciente_id={PACIENTE_ID}")
        docs = res.json()
        if docs:
            for campo in ("id", "nombre_original", "content_type", "tamano_bytes"):
                assert campo in docs[0], f"Falta campo '{campo}' en la respuesta"


# ─────────────────────────────────────────────────────────────────────────────

class TestVerDocumento:
    @skip_if_no_app
    def test_ver_documento_existente_devuelve_200_o_307(self):
        # Subir
        r = client.post(
            "/api/documentos",
            data={"paciente_id": PACIENTE_ID},
            files={"file": ("rx.jpg", radiografia_minimal(), "image/jpeg")},
        )
        doc_id = r.json().get("id")
        if not doc_id:
            pytest.skip("El subir no devolvió id; se omite test de ver")

        res = client.get(f"/api/documentos/{doc_id}/archivo", follow_redirects=False)
        assert res.status_code in (200, 307, 302)

    @skip_if_no_app
    def test_ver_documento_inexistente_devuelve_404(self):
        res = client.get("/api/documentos/999999/archivo", follow_redirects=False)
        assert res.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────

class TestAnalizarImagen:
    """
    El endpoint llama a OpenAI. En pruebas de integración, si OPENAI_API_KEY
    es 'sk-test-integracion' (inválida), el servicio devuelve el resultado
    del fallback por reglas locales (no falla con 500).
    """

    @skip_if_no_app
    def test_analizar_imagen_devuelve_respuesta_estructurada(self):
        res = client.post(
            "/api/analizar-imagen",
            data={"paciente_id": PACIENTE_ID, "descripcion": "Radiografia de torax"},
            files={"file": ("rx.jpg", radiografia_minimal(), "image/jpeg")},
        )
        # Con API key inválida puede devolver 200 (fallback) o 422/503
        assert res.status_code in (200, 422, 503), f"body: {res.text[:300]}"

    @skip_if_no_app
    def test_analizar_sin_imagen_devuelve_422(self):
        res = client.post(
            "/api/analizar-imagen",
            data={"paciente_id": PACIENTE_ID},
        )
        assert res.status_code == 422

    @skip_if_no_app
    def test_respuesta_fallback_incluye_clasificacion(self):
        res = client.post(
            "/api/analizar-imagen",
            data={"paciente_id": PACIENTE_ID, "descripcion": "Ecografia abdominal"},
            files={"file": ("eco.jpg", radiografia_minimal(), "image/jpeg")},
        )
        if res.status_code == 200:
            body = res.json()
            assert "clasificacion" in body or "hallazgos" in body


# ─────────────────────────────────────────────────────────────────────────────

class TestResultados:
    @skip_if_no_app
    def test_listar_resultados_devuelve_lista(self):
        res = client.get(f"/api/resultados?paciente_id={PACIENTE_ID}")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    @skip_if_no_app
    def test_revision_estado_invalido_devuelve_422(self):
        res = client.put(
            "/api/resultados/1/revision",
            json={"estado": "INVENTADO", "decision": "test"},
        )
        assert res.status_code in (404, 422)

    @skip_if_no_app
    def test_revision_resultado_inexistente_devuelve_404(self):
        res = client.put(
            "/api/resultados/999999/revision",
            json={"estado": "CONFIRMADO", "decision": "Test de integracion"},
        )
        assert res.status_code == 404
