import json
import mimetypes
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import DocumentoClinico, ResultadoIa


def _detect_content_type(path: Path, filename: str, content_type: str | None) -> str | None:
    if content_type and content_type != "application/octet-stream":
        return content_type

    guessed, _ = mimetypes.guess_type(filename)
    if guessed:
        return guessed

    try:
        header = path.read_bytes()[:12]
    except OSError:
        return content_type

    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"%PDF"):
        return "application/pdf"
    return content_type


def save_upload(
    db: Session,
    settings: Settings,
    file: UploadFile,
    paciente_id: str | None,
    descripcion: str | None,
) -> DocumentoClinico:
    max_bytes = settings.max_upload_mb * 1024 * 1024
    suffix = Path(file.filename or "archivo").suffix
    safe_name = f"{uuid4().hex}{suffix}"
    target = settings.upload_path / safe_name

    size = 0
    with target.open("wb") as out:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"Archivo supera {settings.max_upload_mb} MB")
            out.write(chunk)

    content_type = _detect_content_type(target, file.filename or safe_name, file.content_type)

    doc = DocumentoClinico(
        paciente_id=paciente_id,
        nombre_original=file.filename or safe_name,
        content_type=content_type,
        ruta=str(target),
        tamano_bytes=size,
        descripcion=descripcion,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def copy_existing_document_to_uploads(db: Session, settings: Settings, doc: DocumentoClinico) -> Path:
    path = Path(doc.ruta)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo fisico no encontrado")
    return path


def save_result(
    db: Session,
    tipo: str,
    proveedor: str,
    resultado: dict,
    paciente_id: str | None = None,
    documento_id: int | None = None,
    entrada_resumen: str | None = None,
    estado_revision: str = "PENDIENTE",
) -> ResultadoIa:
    row = ResultadoIa(
        paciente_id=paciente_id,
        documento_id=documento_id,
        tipo=tipo,
        proveedor=proveedor,
        entrada_resumen=entrada_resumen,
        resultado_json=json.dumps(resultado, ensure_ascii=False),
        estado_revision=estado_revision,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
