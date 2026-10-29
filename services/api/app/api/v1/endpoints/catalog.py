import re
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.importer import (
    CATALOG_HEADER_ALIASES,
    CatalogFileError,
    CatalogMappingRequiredError,
    CatalogValidationError,
    parse_catalog_file,
)
from app.catalog.service import (
    list_catalog_imports,
    list_catalog_products,
    persist_catalog_import,
)
from app.core.config import get_settings
from app.db.session import get_db_session
from app.documents.layout import normalize_header
from app.llm.client import LLMInputLimitError, LLMJobBudget, create_llm_client
from app.schemas.catalog import (
    CatalogColumnMapping,
    CatalogImportListItem,
    CatalogImportResponse,
    CatalogProductRead,
)

router = APIRouter(prefix="/catalog", tags=["catalog"])
CONTACT_VALUE = re.compile(r"@|\+?\d[\d\s()./-]{7,}\d")


def _safe_catalog_mapping_payload(
    error: CatalogMappingRequiredError,
) -> tuple[list[str], list[list[str]]]:
    safe_fields = {"sku", "name", "unit", "aliases"}
    safe_header_aliases = {
        normalize_header(alias) for field in safe_fields for alias in CATALOG_HEADER_ALIASES[field]
    }
    safe_columns = {
        index
        for index, header in enumerate(error.headers)
        if normalize_header(header) in safe_header_aliases
    }
    headers = ["[redacted]" if CONTACT_VALUE.search(header) else header for header in error.headers]
    sample_rows = [
        [
            value if index in safe_columns and not CONTACT_VALUE.search(value) else ""
            for index, value in enumerate(row)
        ]
        for row in error.sample_rows[:5]
    ]
    return headers, sample_rows


@router.post("/imports", response_model=CatalogImportResponse, status_code=status.HTTP_201_CREATED)
async def create_catalog_import(
    file: UploadFile = File(...),
    mapping: str | None = Form(None),
    sheet_name: str | None = Form(None),
    session: AsyncSession = Depends(get_db_session),
) -> CatalogImportResponse:
    settings = get_settings()
    file_bytes = await file.read(settings.max_document_size_bytes + 1)
    await file.close()
    if len(file_bytes) > settings.max_document_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=(
                "Fajl je veći od dozvoljenih "
                f"{settings.max_document_size_bytes // (1024 * 1024)} MB."
            ),
        )

    column_mapping: CatalogColumnMapping | None = None
    if mapping is not None:
        try:
            column_mapping = CatalogColumnMapping.model_validate_json(mapping)
        except ValidationError as error:
            issues = [
                {"field": ".".join(str(part) for part in issue["loc"]), "message": issue["msg"]}
                for issue in error.errors()
            ]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"message": "Mapiranje kolona nije validno.", "errors": issues},
            ) from error

    filename = file.filename
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fajl nema naziv.")
    filename = filename.replace("\\", "/").rsplit("/", maxsplit=1)[-1]

    try:
        parsed_catalog = parse_catalog_file(
            filename=filename,
            file_bytes=file_bytes,
            mapping=column_mapping,
            sheet_name=sheet_name,
        )
    except CatalogMappingRequiredError as error:
        llm_settings = get_settings()
        llm_client = create_llm_client(
            llm_settings,
            job_budget=LLMJobBudget(llm_settings.llm_job_max_tokens),
        )
        if llm_client is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"message": str(error), "code": "CATALOG_MAPPING_REQUIRED"},
            ) from error

        try:
            headers, sample_rows = _safe_catalog_mapping_payload(error)
            suggestion, _ = await llm_client.suggest_catalog_column_mapping(
                headers=headers,
                sample_rows=sample_rows,
            )
            if suggestion is None or any(
                index is not None and index >= len(error.headers)
                for index in suggestion.model_dump().values()
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail={"message": str(error), "code": "CATALOG_MAPPING_REQUIRED"},
                ) from error
            parsed_catalog = parse_catalog_file(
                filename=filename,
                file_bytes=file_bytes,
                mapping=suggestion,
                sheet_name=error.sheet_name,
                header_row=error.header_row,
            )
        except CatalogValidationError as mapping_error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "message": "Automatsko mapiranje nije prošlo validaciju.",
                    "errors": mapping_error.errors,
                },
            ) from mapping_error
        except LLMInputLimitError as mapping_error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"message": str(mapping_error), "code": "CATALOG_MAPPING_REQUIRED"},
            ) from mapping_error
        finally:
            await llm_client.close()
    except CatalogValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"message": "Podaci kataloga nisu validni.", "errors": error.errors},
        ) from error
    except CatalogFileError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    try:
        return await persist_catalog_import(
            session,
            checksum=parsed_catalog.checksum,
            sheet_name=parsed_catalog.sheet_name,
            original_filename=filename,
            products=parsed_catalog.products,
            aliases_imported=parsed_catalog.aliases_imported,
        )
    except IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Katalog nije sačuvan zbog konflikta verzije. Pokušajte ponovo.",
        ) from error


@router.get("/imports", response_model=list[CatalogImportListItem])
async def get_catalog_imports(
    session: AsyncSession = Depends(get_db_session),
) -> list[CatalogImportListItem]:
    return await list_catalog_imports(session)


@router.get("/products", response_model=list[CatalogProductRead])
async def get_catalog_products(
    catalog_import_id: UUID | None = None,
    query: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_db_session),
) -> list[CatalogProductRead]:
    return await list_catalog_products(
        session,
        catalog_import_id=catalog_import_id,
        query=query,
    )
