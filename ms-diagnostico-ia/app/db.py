from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_resultado_revision_columns()


def _ensure_resultado_revision_columns() -> None:
    inspector = inspect(engine)
    if "resultado_ia" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("resultado_ia")}
    migrations = {
        "estado_revision": "ALTER TABLE resultado_ia ADD COLUMN estado_revision VARCHAR(30) DEFAULT 'PENDIENTE' NOT NULL",
        "decision_medica": "ALTER TABLE resultado_ia ADD COLUMN decision_medica TEXT",
        "revisado_por": "ALTER TABLE resultado_ia ADD COLUMN revisado_por VARCHAR(120)",
        "revisado_en": "ALTER TABLE resultado_ia ADD COLUMN revisado_en DATETIME",
    }
    with engine.begin() as conn:
        for name, ddl in migrations.items():
            if name not in existing:
                conn.execute(text(ddl))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
