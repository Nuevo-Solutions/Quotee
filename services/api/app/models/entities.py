from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    ApprovalState,
    DocumentType,
    ItemType,
    OfferBasis,
    ProcessingStatus,
    ReviewStatus,
    WorkflowType,
)
from app.db.base import Base, TimestampMixin, UUIDPrimaryKey


def enum_column(enum_class: type[Enum], name: str) -> SAEnum:
    return SAEnum(
        enum_class,
        name=name,
        native_enum=False,
        values_callable=lambda values: [value.value for value in values],
    )


class Organization(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    locale: Mapped[str] = mapped_column(String(20), default="sr-Latn-RS", nullable=False)
    default_currency: Mapped[str] = mapped_column(String(3), default="RSD", nullable=False)


class User(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Membership(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id"),)

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String(40), nullable=False)


class CatalogImport(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "catalog_imports"
    __table_args__ = (UniqueConstraint("organization_id", "version"),)

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False)


class Product(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("organization_id", "catalog_import_id", "sku"),)

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    catalog_import_id: Mapped[UUID] = mapped_column(
        ForeignKey("catalog_imports.id", ondelete="CASCADE"), nullable=False
    )
    sku: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    unit: Mapped[str] = mapped_column(String(40), nullable=False)
    price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    currency: Mapped[str | None] = mapped_column(String(3))
    vat_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ProductAlias(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "product_aliases"
    __table_args__ = (UniqueConstraint("organization_id", "product_id", "alias"),)

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    product_id: Mapped[UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    alias: Mapped[str] = mapped_column(String(500), nullable=False)


class ServicePriceList(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "service_price_lists"
    __table_args__ = (UniqueConstraint("organization_id", "version"),)

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)


class ServicePrice(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "service_prices"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    price_list_id: Mapped[UUID] = mapped_column(
        ForeignKey("service_price_lists.id", ondelete="CASCADE"), index=True, nullable=False
    )
    code: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    item_type: Mapped[ItemType] = mapped_column(enum_column(ItemType, "service_item_type"))
    unit: Mapped[str] = mapped_column(String(40), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)


class Document(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "documents"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    uploader_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    document_type: Mapped[DocumentType] = mapped_column(
        enum_column(DocumentType, "document_type"), nullable=False
    )
    workflow: Mapped[WorkflowType | None] = mapped_column(
        enum_column(WorkflowType, "document_workflow")
    )
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    object_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[ProcessingStatus] = mapped_column(
        enum_column(ProcessingStatus, "processing_status"),
        default=ProcessingStatus.UPLOADED,
        nullable=False,
    )


class ProcessingJob(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "processing_jobs"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_type: Mapped[WorkflowType | None] = mapped_column(enum_column(WorkflowType, "job_workflow"))
    status: Mapped[ProcessingStatus] = mapped_column(
        enum_column(ProcessingStatus, "job_processing_status"),
        default=ProcessingStatus.UPLOADED,
        nullable=False,
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(100))


class SourceSection(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "source_sections"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    parent_section_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("source_sections.id", ondelete="SET NULL")
    )
    position_code: Mapped[str | None] = mapped_column(String(120))
    heading: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    source_ref: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class ExtractedPosition(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "extracted_positions"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    section_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("source_sections.id", ondelete="SET NULL")
    )
    position_code: Mapped[str | None] = mapped_column(String(120))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_description: Mapped[str] = mapped_column(Text, nullable=False)
    item_type: Mapped[ItemType] = mapped_column(enum_column(ItemType, "position_item_type"))
    original_quantity: Mapped[Decimal | None] = mapped_column(Numeric(20, 6))
    original_unit: Mapped[str | None] = mapped_column(String(40))
    source_ref: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    flags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)


class MatchCandidate(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "match_candidates"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    extracted_position_id: Mapped[UUID] = mapped_column(
        ForeignKey("extracted_positions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    product_id: Mapped[UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True, nullable=False
    )
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)


class QuoteDraft(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "quote_drafts"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    workflow: Mapped[WorkflowType] = mapped_column(enum_column(WorkflowType, "quote_workflow"))
    offer_basis: Mapped[OfferBasis | None] = mapped_column(enum_column(OfferBasis, "offer_basis"))
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[ApprovalState] = mapped_column(
        enum_column(ApprovalState, "approval_state"),
        default=ApprovalState.DRAFT,
        nullable=False,
    )
    catalog_snapshot_id: Mapped[UUID | None] = mapped_column(ForeignKey("catalog_imports.id"))
    service_price_list_snapshot_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("service_price_lists.id")
    )


class QuoteLine(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "quote_lines"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    quote_draft_id: Mapped[UUID] = mapped_column(
        ForeignKey("quote_drafts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    extracted_position_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("extracted_positions.id", ondelete="SET NULL")
    )
    position_code: Mapped[str | None] = mapped_column(String(120))
    item_type: Mapped[ItemType] = mapped_column(enum_column(ItemType, "quote_line_item_type"))
    selected_product_id: Mapped[UUID | None] = mapped_column(ForeignKey("products.id"))
    approved_quantity: Mapped[Decimal | None] = mapped_column(Numeric(20, 6))
    approved_unit: Mapped[str | None] = mapped_column(String(40))
    approved_unit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    approved_vat_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    price_source: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    review_status: Mapped[ReviewStatus] = mapped_column(
        enum_column(ReviewStatus, "quote_line_review_status"),
        default=ReviewStatus.EXTRACTED,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text)


class QuoteVersion(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "quote_versions"
    __table_args__ = (UniqueConstraint("quote_draft_id", "version"),)

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    quote_draft_id: Mapped[UUID] = mapped_column(
        ForeignKey("quote_drafts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    approved_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column()


class AuditEvent(UUIDPrimaryKey, Base):
    __tablename__ = "audit_events"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    event_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
