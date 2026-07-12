# MS2 - Diagnostico e IA

Microservicio Python/FastAPI para pre-triaje, analisis de imagenes clinicas y gestion documental.

## Responsabilidades

- Pre-triaje por texto usando Gemini cuando hay API key y reglas locales como fallback.
- Analisis de imagen con Gemini Vision cuando esta configurado.
- Gestion documental basica con archivos locales y metadatos en SQLite o DynamoDB.
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
- `GET /api/documentos?paciente_id=...`
- `GET /api/documentos/{documento_id}`
- `GET /api/resultados/{resultado_id}`
- `GET /api/resultados/paciente/{paciente_id}`
- `PATCH /api/resultados/{resultado_id}/revision`
- `GET /api/indicadores`

## Persistencia con DynamoDB

Para produccion puedes guardar los metadatos y resultados del MS2 en DynamoDB.

Tabla recomendada:

```text
Nombre: ms2_diagnostico_ia
Clave de particion: pk (String)
Clave de ordenacion: sk (String)
Modo de capacidad: Bajo demanda
Region: sa-east-1
```

Variables de entorno en Render:

```env
STORAGE_BACKEND=dynamodb
AWS_REGION=sa-east-1
DYNAMODB_TABLE=ms2_diagnostico_ia
S3_BUCKET=ms2-diagnostico-ia-uploads
S3_PREFIX=uploads
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Si `S3_BUCKET` esta configurado, los archivos subidos se copian a S3 y el documento guarda `s3_bucket` y `s3_key`. El archivo local se conserva temporalmente para el analisis inmediato con Gemini.

Permisos IAM recomendados para DynamoDB + S3:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Ms2DynamoDbAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:DescribeTable",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Scan",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:sa-east-1:604579607918:table/ms2_diagnostico_ia"
    },
    {
      "Sid": "Ms2S3UploadsAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::ms2-diagnostico-ia-uploads/uploads/*"
    }
  ]
}
```

## Seguridad

El archivo `.env` no se versiona. No subas claves reales al repositorio.
