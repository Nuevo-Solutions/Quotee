import hashlib
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.enums import DocumentType, FileFormat, ProcessingStatus, WorkflowType
from app.core.workspace import ensure_local_organization
from app.models import Document
from app.schemas.domain import DocumentRead

CHUNK_SIZE = 1024 * 1024
MIME_TYPES = {
    FileFormat.PDF: "application/pdf",
    FileFormat.XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    FileFormat.CSV: "text/csv",
    FileFormat.EML: "message/rfc822",
}


class DocumentTooLargeError(ValueError):
    pass


class InvalidDocumentError(ValueError):
    pass


def get_storage_directory() -> Path:
    return get_settings().document_storage_path


def _format_for_filename(filename: str) -> FileFormat:
    extension = Path(filename.replace("\\", "/")).suffix.lower()
    try:
        return FileFormat(extension.removeprefix(".").upper())
    except ValueError as error:
        raise InvalidDocumentError("Podržani formati su PDF, XLSX, CSV i EML.") from error


def get_document_format(document: Document) -> FileFormat:
    return _format_for_filename(document.original_filename)


def _validate_signature(file_format: FileFormat, prefix: bytes) -> None:
    if file_format is FileFormat.PDF and not prefix.startswith(b"%PDF-"):
        raise InvalidDocumentError("Sadržaj fajla ne izgleda kao ispravan PDF.")
    if file_format is FileFormat.XLSX and not prefix.startswith(b"PK\x03\x04"):
        raise InvalidDocumentError("Sadržaj fajla ne izgleda kao ispravan XLSX.")
    if file_format in (FileFormat.CSV, FileFormat.EML) and b"\x00" in prefix:
        raise InvalidDocumentError("CSV i EML fajlovi moraju biti tekstualni.")


def _metadata_path(document_id: UUID) -> Path:
    return get_storage_directory() / f"{document_id}.json"


def _content_path(document: DocumentRead) -> Path:
    return get_storage_directory() / f"{document.id.hex}.{document.format.value.lower()}"


async def store_document(
    upload: UploadFile,
    document_type: DocumentType,
    workflow: WorkflowType | None,
    session: AsyncSession,
) -> DocumentRead:
    if not upload.filename:
        raise InvalidDocumentError("Fajl nema naziv.")

    original_filename = Path(upload.filename.replace("\\", "/")).name
    file_format = _format_for_filename(original_filename)
    directory = get_storage_directory()
    directory.mkdir(parents=True, exist_ok=True)

    document_id = uuid4()
    temporary_path = directory / f".{document_id.hex}.uploading"
    content_path = directory / f"{document_id.hex}.{file_format.value.lower()}"
    metadata_path = _metadata_path(document_id)
    temporary_metadata_path = metadata_path.with_suffix(".json.tmp")
    digest = hashlib.sha256()
    prefix = bytearray()
    total_size = 0

    try:
        with temporary_path.open("wb") as stored_file:
            while chunk := await upload.read(CHUNK_SIZE):
                total_size += len(chunk)
                if total_size > get_settings().max_document_size_bytes:
                    raise DocumentTooLargeError("Fajl je veći od dozvoljenih 20 MB.")
                if len(prefix) < 8192:
                    prefix.extend(chunk[: 8192 - len(prefix)])
                digest.update(chunk)
                stored_file.write(chunk)

        if total_size == 0:
            raise InvalidDocumentError("Izabrani fajl je prazan.")
        _validate_signature(file_format, bytes(prefix))

        now = datetime.now(timezone.utc)
        document = DocumentRead(
            id=document_id,
            document_type=document_type,
            workflow=workflow,
            original_filename=original_filename,
            format=file_format,
            status=ProcessingStatus.UPLOADED,
            size_bytes=total_size,
            mime_type=MIME_TYPES[file_format]
            or mimetypes.guess_type(original_filename)[0]
            or "application/octet-stream",
            sha256=digest.hexdigest(),
            created_at=now,
            updated_at=now,
        )

        temporary_path.replace(content_path)
        temporary_metadata_path.write_text(document.model_dump_json(), encoding="utf-8")
        temporary_metadata_path.replace(metadata_path)

        async with session.begin():
            organization_id = await ensure_local_organization(session)
            session.add(
                Document(
                    id=document_id,
                    organization_id=organization_id,
                    document_type=document_type,
                    workflow=workflow,
                    original_filename=original_filename,
                    mime_type=document.mime_type,
                    object_key=content_path.name,
                    sha256=document.sha256,
                    status=ProcessingStatus.UPLOADED,
                )
            )
        return document
    except Exception:
        temporary_path.unlink(missing_ok=True)
        content_path.unlink(missing_ok=True)
        temporary_metadata_path.unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()


def list_documents(workflow: WorkflowType | None = None) -> list[DocumentRead]:
    directory = get_storage_directory()
    if not directory.exists():
        return []

    documents = [
        DocumentRead.model_validate_json(metadata_path.read_text(encoding="utf-8"))
        for metadata_path in directory.glob("*.json")
    ]
    if workflow is not None:
        documents = [document for document in documents if document.workflow is workflow]
    return sorted(documents, key=lambda document: document.created_at, reverse=True)


def get_document(document_id: UUID) -> DocumentRead | None:
    metadata_path = _metadata_path(document_id)
    if not metadata_path.is_file():
        return None
    return DocumentRead.model_validate_json(metadata_path.read_text(encoding="utf-8"))


def get_document_content_path(document: DocumentRead) -> Path | None:
    content_path = _content_path(document)
    return content_path if content_path.is_file() else None
