from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.api.v1.endpoints._not_implemented import not_implemented
from app.core.enums import DocumentType, WorkflowType
from app.documents.storage import (
    DocumentTooLargeError,
    InvalidDocumentError,
    get_document,
    get_document_content_path,
    store_document,
)
from app.documents.storage import (
    list_documents as read_documents,
)
from app.schemas.domain import DocumentRead

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    document_type: DocumentType = Form(DocumentType.INQUIRY),
    workflow: WorkflowType | None = Form(None),
) -> DocumentRead:
    try:
        return await store_document(file, document_type, workflow)
    except DocumentTooLargeError as error:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=str(error),
        ) from error
    except InvalidDocumentError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("", response_model=list[DocumentRead])
async def list_documents(workflow: WorkflowType | None = None) -> list[DocumentRead]:
    return read_documents(workflow)


@router.get("/{document_id}", response_model=DocumentRead)
async def get_document_metadata(document_id: UUID) -> DocumentRead:
    document = get_document(document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dokument nije pronađen.")
    return document


@router.get("/{document_id}/content")
async def get_document_content(document_id: UUID) -> FileResponse:
    document = get_document(document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dokument nije pronađen.")
    content_path = get_document_content_path(document)
    if content_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sadržaj dokumenta nije pronađen.",
        )
    return FileResponse(
        content_path,
        media_type=document.mime_type,
        filename=document.original_filename,
        content_disposition_type="inline",
    )


@router.post("/{document_id}/process", status_code=501)
async def process_document(document_id: UUID) -> None:
    not_implemented("Document processing")


@router.get("/{document_id}/positions", status_code=501)
async def list_document_positions(document_id: UUID) -> None:
    not_implemented("Extracted positions")
