from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.db import Base


class DocumentoClinico(Base):
    __tablename__ = "documento_clinico"

    id = Column(Integer, primary_key=True, index=True)
    paciente_id = Column(String(80), index=True, nullable=True)
    nombre_original = Column(String(255), nullable=False)
    content_type = Column(String(120), nullable=True)
    ruta = Column(String(500), nullable=False)
    s3_bucket = Column(String(255), nullable=True)
    s3_key = Column(String(500), nullable=True)
    tamano_bytes = Column(Integer, nullable=False)
    descripcion = Column(Text, nullable=True)
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)


class ResultadoIa(Base):
    __tablename__ = "resultado_ia"

    id = Column(Integer, primary_key=True, index=True)
    paciente_id = Column(String(80), index=True, nullable=True)
    documento_id = Column(Integer, nullable=True)
    tipo = Column(String(60), index=True, nullable=False)
    proveedor = Column(String(60), nullable=False)
    entrada_resumen = Column(Text, nullable=True)
    resultado_json = Column(Text, nullable=False)
    estado_revision = Column(String(30), default="PENDIENTE", nullable=False)
    decision_medica = Column(Text, nullable=True)
    revisado_por = Column(String(120), nullable=True)
    revisado_en = Column(DateTime, nullable=True)
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)
