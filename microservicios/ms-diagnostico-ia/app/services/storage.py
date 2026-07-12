import json
import mimetypes
import random
import time

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import DocumentoClinico, ResultadoIa


@dataclass
class DocumentoRecord:
    id: int
    paciente_id: str | None
    nombre_original: str
    content_type: str | None
    ruta: str
    s3_bucket: str | None
    s3_key: str | None
    tamano_bytes: int
    descripcion: str | None
    creado_en: datetime


@dataclass
class ResultadoRecord:
    id: int
    paciente_id: str | None
    documento_id: int | None
    tipo: str
    proveedor: str
    entrada_resumen: str | None
    resultado_json: str
    estado_revision: str
    decision_medica: str | None
    revisado_por: str | None
    revisado_en: datetime | None
    creado_en: datetime


def _uses_dynamodb(settings: Settings) -> bool:
    return settings.storage_backend.lower() == "dynamodb"


def _new_id() -> int:
    return int(time.time() * 1000) * 1000 + random.randint(0, 999)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _table(settings: Settings):
    try:
        import boto3
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="boto3 no esta instalado para usar DynamoDB") from exc

    return boto3.resource("dynamodb", region_name=settings.aws_region).Table(settings.dynamodb_table)


def _s3_client(settings: Settings):
    try:
        import boto3
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="boto3 no esta instalado para usar S3") from exc

    return boto3.client("s3", region_name=settings.aws_region)


def _upload_to_s3(settings: Settings, path: Path, content_type: str | None) -> tuple[str | None, str | None]:
    if not settings.s3_bucket:
        return None, None

    prefix = settings.s3_prefix.strip("/")
    key = f"{prefix}/{path.name}" if prefix else path.name
    extra_args: dict[str, str] = {}
    if content_type:
        extra_args["ContentType"] = content_type

    _s3_client(settings).upload_file(
        str(path),
        settings.s3_bucket,
        key,
        ExtraArgs=extra_args or None,
    )
    return settings.s3_bucket, key


def _doc_from_item(item: dict[str, Any]) -> DocumentoRecord:
    return DocumentoRecord(
        id=int(item["id"]),
        paciente_id=item.get("paciente_id"),
        nombre_original=item["nombre_original"],
        content_type=item.get("content_type"),
        ruta=item["ruta"],
        s3_bucket=item.get("s3_bucket"),
        s3_key=item.get("s3_key"),
        tamano_bytes=int(item["tamano_bytes"]),
        descripcion=item.get("descripcion"),
        creado_en=_parse_datetime(item.get("creado_en")) or datetime.utcnow(),
    )


def _result_from_item(item: dict[str, Any]) -> ResultadoRecord:
    return ResultadoRecord(
        id=int(item["id"]),
        paciente_id=item.get("paciente_id"),
        documento_id=int(item["documento_id"]) if item.get("documento_id") is not None else None,
        tipo=item["tipo"],
        proveedor=item["proveedor"],
        entrada_resumen=item.get("entrada_resumen"),
        resultado_json=item["resultado_json"],
        estado_revision=item.get("estado_revision", "PENDIENTE"),
        decision_medica=item.get("decision_medica"),
        revisado_por=item.get("revisado_por"),
        revisado_en=_parse_datetime(item.get("revisado_en")),
        creado_en=_parse_datetime(item.get("creado_en")) or datetime.utcnow(),
    )


def _scan_all(settings: Settings, entity_type: str) -> list[dict[str, Any]]:
    table = _table(settings)
    items: list[dict[str, Any]] = []
    kwargs: dict[str, Any] = {
        "FilterExpression": "entity_type = :entity_type",
        "ExpressionAttributeValues": {":entity_type": entity_type},
    }
    while True:
        response = table.scan(**kwargs)
        items.extend(response.get("Items", []))
        if "LastEvaluatedKey" not in response:
            break
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return items


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
) -> DocumentoClinico | DocumentoRecord:
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
    s3_bucket, s3_key = _upload_to_s3(settings, target, content_type)

    doc_data = {
        "paciente_id": paciente_id,
        "nombre_original": file.filename or safe_name,
        "content_type": content_type,
        "ruta": str(target),
        "s3_bucket": s3_bucket,
        "s3_key": s3_key,
        "tamano_bytes": size,
        "descripcion": descripcion,
    }

    if _uses_dynamodb(settings):
        doc_id = _new_id()
        created = datetime.utcnow()
        item = {
            "pk": f"DOC#{doc_id}",
            "sk": "METADATA",
            "entity_type": "documento",
            "id": doc_id,
            "creado_en": _iso(created),
            **{key: value for key, value in doc_data.items() if value is not None},
        }
        _table(settings).put_item(Item=item)
        return DocumentoRecord(id=doc_id, creado_en=created, **doc_data)

    doc = DocumentoClinico(**doc_data)
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
    settings: Settings,
    tipo: str,
    proveedor: str,
    resultado: dict,
    paciente_id: str | None = None,
    documento_id: int | None = None,
    entrada_resumen: str | None = None,
    estado_revision: str = "PENDIENTE",
) -> ResultadoIa | ResultadoRecord:
    resultado_json = json.dumps(resultado, ensure_ascii=False)
    if _uses_dynamodb(settings):
        row_id = _new_id()
        created = datetime.utcnow()
        item = {
            "pk": f"RES#{row_id}",
            "sk": "METADATA",
            "entity_type": "resultado",
            "id": row_id,
            "tipo": tipo,
            "proveedor": proveedor,
            "resultado_json": resultado_json,
            "estado_revision": estado_revision,
            "creado_en": _iso(created),
        }
        optional = {
            "paciente_id": paciente_id,
            "documento_id": documento_id,
            "entrada_resumen": entrada_resumen,
        }
        item.update({key: value for key, value in optional.items() if value is not None})
        _table(settings).put_item(Item=item)
        return ResultadoRecord(
            id=row_id,
            paciente_id=paciente_id,
            documento_id=documento_id,
            tipo=tipo,
            proveedor=proveedor,
            entrada_resumen=entrada_resumen,
            resultado_json=resultado_json,
            estado_revision=estado_revision,
            decision_medica=None,
            revisado_por=None,
            revisado_en=None,
            creado_en=created,
        )

    row = ResultadoIa(
        paciente_id=paciente_id,
        documento_id=documento_id,
        tipo=tipo,
        proveedor=proveedor,
        entrada_resumen=entrada_resumen,
        resultado_json=resultado_json,
        estado_revision=estado_revision,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_documents(db: Session, settings: Settings, paciente_id: str) -> list[DocumentoClinico | DocumentoRecord]:
    if _uses_dynamodb(settings):
        items = [
            item for item in _scan_all(settings, "documento")
            if item.get("paciente_id") == paciente_id
        ]
        rows = [_doc_from_item(item) for item in items]
        return sorted(rows, key=lambda row: row.creado_en, reverse=True)[:100]

    return (
        db.query(DocumentoClinico)
        .filter(DocumentoClinico.paciente_id == paciente_id)
        .order_by(DocumentoClinico.creado_en.desc())
        .limit(100)
        .all()
    )


def get_document(db: Session, settings: Settings, documento_id: int) -> DocumentoClinico | DocumentoRecord | None:
    if _uses_dynamodb(settings):
        response = _table(settings).get_item(Key={"pk": f"DOC#{documento_id}", "sk": "METADATA"})
        item = response.get("Item")
        return _doc_from_item(item) if item else None
    return db.get(DocumentoClinico, documento_id)


def list_results_by_patient(db: Session, settings: Settings, paciente_id: str) -> list[ResultadoIa | ResultadoRecord]:
    if _uses_dynamodb(settings):
        items = [
            item for item in _scan_all(settings, "resultado")
            if item.get("paciente_id") == paciente_id
        ]
        rows = [_result_from_item(item) for item in items]
        return sorted(rows, key=lambda row: row.creado_en, reverse=True)[:50]

    return (
        db.query(ResultadoIa)
        .filter(ResultadoIa.paciente_id == paciente_id)
        .order_by(ResultadoIa.creado_en.desc())
        .limit(50)
        .all()
    )


def get_result(db: Session, settings: Settings, resultado_id: int) -> ResultadoIa | ResultadoRecord | None:
    if _uses_dynamodb(settings):
        response = _table(settings).get_item(Key={"pk": f"RES#{resultado_id}", "sk": "METADATA"})
        item = response.get("Item")
        return _result_from_item(item) if item else None
    return db.get(ResultadoIa, resultado_id)


def list_results(db: Session, settings: Settings) -> list[ResultadoIa | ResultadoRecord]:
    if _uses_dynamodb(settings):
        return [_result_from_item(item) for item in _scan_all(settings, "resultado")]
    return db.query(ResultadoIa).all()


def update_result_revision(
    db: Session,
    settings: Settings,
    row: ResultadoIa | ResultadoRecord,
    estado_revision: str,
    decision_medica: str | None,
    revisado_por: str | None,
) -> ResultadoIa | ResultadoRecord:
    revisado_en = datetime.utcnow() if estado_revision != "PENDIENTE" else None

    if _uses_dynamodb(settings):
        update_expression = "SET estado_revision = :estado_revision, decision_medica = :decision_medica, revisado_por = :revisado_por"
        values = {
            ":estado_revision": estado_revision,
            ":decision_medica": decision_medica or "",
            ":revisado_por": revisado_por or "",
        }
        if revisado_en:
            update_expression += ", revisado_en = :revisado_en"
            values[":revisado_en"] = _iso(revisado_en)
        else:
            update_expression += " REMOVE revisado_en"

        response = _table(settings).update_item(
            Key={"pk": f"RES#{row.id}", "sk": "METADATA"},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )
        return _result_from_item(response["Attributes"])

    row.estado_revision = estado_revision
    row.decision_medica = decision_medica
    row.revisado_por = revisado_por
    row.revisado_en = revisado_en
    db.commit()
    db.refresh(row)
    return row
