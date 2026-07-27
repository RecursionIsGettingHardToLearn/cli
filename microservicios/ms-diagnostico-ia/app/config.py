from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ms-diagnostico-ia"
    environment: str = "development"
    port: int = 8000
    cors_origins: str = "http://localhost:4200,http://localhost:3000,http://localhost:8080"

    # OpenAI es el unico proveedor de IA: reportes por voz (Whisper + chat),
    # pre-triaje y analisis de imagen (vision).
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_transcribe_model: str = "whisper-1"
    # Modelo multimodal para /api/analizar-imagen. gpt-4o-mini soporta vision.
    openai_vision_model: str = "gpt-4o-mini"

    # Orden de intento de proveedores. Hoy solo existe OpenAI; si no hay clave,
    # quedan las reglas locales para que el endpoint nunca rompa el flujo.
    ia_provider_order: str = "openai"

    database_url: str = "sqlite:///./data/ms_ia.db"
    upload_dir: str = "./data/uploads"
    max_upload_mb: int = 15
    storage_backend: str = "sqlite"
    aws_region: str = "sa-east-1"
    dynamodb_table: str = "ms2_diagnostico_ia"
    s3_bucket: str | None = None
    s3_prefix: str = "uploads"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def upload_path(self) -> Path:
        return Path(self.upload_dir)

    @property
    def ia_provider_list(self) -> list[str]:
        validos = {"openai"}
        orden = [p.strip().lower() for p in self.ia_provider_order.split(",") if p.strip()]
        return [p for p in dict.fromkeys(orden) if p in validos]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    Path("./data").mkdir(parents=True, exist_ok=True)
    return settings
