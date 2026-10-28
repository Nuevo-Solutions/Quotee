from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.enums import DocumentType, FileFormat, ProcessingStatus, WorkflowType
from app.db.session import get_db_session
from app.documents.storage import (
    DocumentTooLargeError,
    InvalidDocumentError,
    get_document,
    get_document_content_path,
    get_document_format,
    store_document,
)
from app.documents.storage import (
    list_documents as read_documents,
)
from app.jobs.service import list_document_positions
from app.llm.schemas import ProductColumnMapping
from app.models import CatalogImport, Document, ProcessingJob
from app.schemas.domain import DocumentRead, JobRead, PositionMatchResultRead

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    document_type: DocumentType = Form(DocumentType.INQUIRY),
    workflow: WorkflowType | None = Form(None),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentRead:
    try:
        return await store_document(file, document_type, workflow, session)
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


@router.post(
    "/{document_id}/process",
    response_model=JobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def process_document(
    document_id: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> JobRead:
    organization_id = get_settings().local_organization_id
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == organization_id,
        )
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dokument nije pronađen.")
    if document.workflow is not WorkflowType.PRODUCT_QUOTE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Technical Quoting obrada još nije implementirana.",
        )
    if get_document_format(document) not in {FileFormat.CSV, FileFormat.XLSX}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "UNSUPPORTED_INPUT",
                "message": "Product obrada trenutno podržava CSV i XLSX.",
            },
        )

    catalog_import = await session.scalar(
        select(CatalogImport)
        .where(CatalogImport.organization_id == organization_id)
        .order_by(CatalogImport.version.desc())
        .limit(1)
    )
    if catalog_import is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "CATALOG_UNAVAILABLE",
                "message": "Uvezite važeći katalog pre pokretanja Product obrade.",
            },
        )

    job = await session.scalar(
        select(ProcessingJob).where(
            ProcessingJob.organization_id == organization_id,
            ProcessingJob.document_id == document.id,
            ProcessingJob.catalog_import_id == catalog_import.id,
        )
    )
    if job is not None and job.status in {
        ProcessingStatus.UPLOADED,
        ProcessingStatus.PROCESSING,
        ProcessingStatus.MAPPING_REQUIRED,
        ProcessingStatus.NEEDS_REVIEW,
    }:
        return JobRead.model_validate(job)

    if job is None:
        job = ProcessingJob(
            organization_id=organization_id,
            document_id=document.id,
            catalog_import_id=catalog_import.id,
            job_type=WorkflowType.PRODUCT_QUOTE,
            status=ProcessingStatus.UPLOADED,
            attempts=0,
        )
        session.add(job)
    else:
        job.status = ProcessingStatus.UPLOADED
        job.error_code = None
        job.error_message = None
        job.finished_at = None
        job.result_count = 0

    document.status = ProcessingStatus.PROCESSING
    await session.commit()
    await session.refresh(job)
    return JobRead.model_validate(job)


@router.post(
    "/{document_id}/jobs/{job_id}/mapping",
    response_model=JobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def confirm_document_mapping(
    document_id: UUID,
    job_id: UUID,
    mapping: ProductColumnMapping,
    session: AsyncSession = Depends(get_db_session),
) -> JobRead:
    organization_id = get_settings().local_organization_id
    job = await session.scalar(
        select(ProcessingJob).where(
            ProcessingJob.id == job_id,
            ProcessingJob.document_id == document_id,
            ProcessingJob.organization_id == organization_id,
        )
    )
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Processing posao nije pronađen.",
        )
    if job.status is not ProcessingStatus.MAPPING_REQUIRED or job.mapping_headers is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Posao trenutno ne čeka potvrdu mapiranja.",
        )
    if any(
        index is not None and index >= len(job.mapping_headers)
        for index in mapping.model_dump().values()
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Mapiranje sadrži kolonu koja ne postoji u dokumentu.",
        )

    document = await session.get(Document, document_id)
    if document is None or document.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dokument nije pronađen.")
    job.column_mapping = mapping.model_dump()
    job.status = ProcessingStatus.UPLOADED
    job.error_code = None
    job.error_message = None
    job.finished_at = None
    document.status = ProcessingStatus.PROCESSING
    await session.commit()
    await session.refresh(job)
    return JobRead.model_validate(job)


@router.get("/{document_id}/jobs/latest", response_model=JobRead | None)
async def get_latest_document_job(
    document_id: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> JobRead | None:
    organization_id = get_settings().local_organization_id
    document = await session.scalar(
        select(Document.id).where(
            Document.id == document_id,
            Document.organization_id == organization_id,
        )
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dokument nije pronađen.")
    job = await session.scalar(
        select(ProcessingJob)
        .where(
            ProcessingJob.organization_id == organization_id,
            ProcessingJob.document_id == document_id,
        )
        .order_by(ProcessingJob.created_at.desc())
        .limit(1)
    )
    return JobRead.model_validate(job) if job is not None else None


@router.get("/{document_id}/positions", response_model=list[PositionMatchResultRead])
async def get_document_positions(
    document_id: UUID,
    job_id: UUID | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> list[PositionMatchResultRead]:
    return await list_document_positions(session, document_id=document_id, job_id=job_id)
