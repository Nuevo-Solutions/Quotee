from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.core.enums import (
    ApprovalState,
    AvailabilityStatus,
    ConfidenceLevel,
    DocumentType,
    FileFormat,
    ItemType,
    OfferBasis,
    PriceStatus,
    ProcessingStatus,
    ReviewStatus,
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
    updated_at: datetime | None = None


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
    job_type: WorkflowType | None
    catalog_import_id: UUID | None
    status: ProcessingStatus
    attempts: int
    error_code: str | None
    error_message: str | None
    result_count: int
    mapping_headers: list[str] | None
    mapping_suggestion: dict[str, int | None] | None
    column_mapping: dict[str, int | None] | None
    llm_input_tokens: int
    llm_output_tokens: int
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class MatchCandidateRead(BaseModel):
    product_id: UUID
    sku: str
    name: str
    unit: str
    price: Decimal | None
    currency: str | None
    rank: int
    evidence: dict[str, Any]


class PositionMatchResultRead(BaseModel):
    id: UUID
    position_code: str | None
    sort_order: int
    raw_description: str
    original_quantity: Decimal | None
    original_unit: str | None
    source_ref: dict[str, Any] | None
    item_type: ItemType
    review_status: ReviewStatus
    confidence: ConfidenceLevel
    reason_codes: list[str]
    price_status: PriceStatus
    availability_status: AvailabilityStatus
    selected_product_id: UUID | None
    candidates: list[MatchCandidateRead]
