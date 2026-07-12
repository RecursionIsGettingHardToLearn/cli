from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "ms-diagnostico-ia"
    environment: str = "development"
    port: int = 8000
    cors_origins: str = "http://localhost:4200,http://localhost:3000,http://localhost:8080"

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"
    gemini_image_model: str = "gemini-2.0-flash"
    gemini_fallback_models: str = "gemini-2.5-flash,gemini-2.5-flash-lite"

    # OpenAI: usado por el modulo de REPORTES CON IA POR VOZ.
    # Whisper transcribe el audio y un modelo de chat arma el plan del reporte.
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_transcribe_model: str = "whisper-1"

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
    def gemini_text_models(self) -> list[str]:
        models = [self.gemini_model]
        models.extend(model.strip() for model in self.gemini_fallback_models.split(",") if model.strip())
        return list(dict.fromkeys(models))

    @property
    def gemini_image_models(self) -> list[str]:
        models = [self.gemini_image_model]
        models.extend(model.strip() for model in self.gemini_fallback_models.split(",") if model.strip())
        return list(dict.fromkeys(models))


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    Path("./data").mkdir(parents=True, exist_ok=True)
    return settings
