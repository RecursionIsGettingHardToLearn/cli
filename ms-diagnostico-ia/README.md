# MS2 - Diagnostico e IA

Microservicio Python/FastAPI para pre-triaje, analisis de imagenes clinicas y gestion documental.

## Responsabilidades

- Pre-triaje por texto usando Gemini cuando hay API key y reglas locales como fallback.
- Analisis de imagen con Gemini Vision cuando esta configurado.
- Gestion documental basica con archivos locales y metadatos en SQLite.
- API HTTP lista para conectarse desde la app movil, Angular, Docker y Kubernetes.

## Ejecutar local

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Endpoints

- `GET /health`
- `POST /api/chat-triaje`
- `POST /api/analizar-imagen`
- `POST /api/documentos`
- `GET /api/documentos/{documento_id}`
- `GET /api/resultados/paciente/{paciente_id}`

## Seguridad

El archivo `.env` no se versiona. No subas claves reales al repositorio.

