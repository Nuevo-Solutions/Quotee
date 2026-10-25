from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.core.enums import (
    ApprovalState,
    DocumentType,
    FileFormat,
    ItemType,
    OfferBasis,
    ProcessingStatus,
    WorkflowType,
)


class SourceRef(BaseModel):
    document_id: UUID
    page: int | None = None
    sheet: str | None = None
    row: int | None = None
    column: str | None = None


class ExtractedPositionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    position_code: str | None
    sort_order: int
    raw_description: str
    item_type: ItemType
    original_quantity: Decimal | None
    original_unit: str | None
    source_ref: dict[str, Any] | None
    flags: list[str]


class DocumentRead(BaseModel):
    id: UUID
    document_type: DocumentType
    workflow: WorkflowType | None
    original_filename: str
    format: FileFormat
    status: ProcessingStatus
    size_bytes: int
    mime_type: str
    sha256: str
    created_at: datetime


class QuoteLineUpdate(BaseModel):
    approved_quantity: Decimal | None = None
    approved_unit: str | None = None
    approved_unit_price: Decimal | None = None
    notes: str | None = None


class QuoteDraftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    workflow: WorkflowType
    offer_basis: OfferBasis | None
    currency: str
    status: ApprovalState
    created_at: datetime


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    status: ProcessingStatus
    attempts: int
    error_code: str | None
