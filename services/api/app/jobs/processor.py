import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.enums import (
    ApprovalState,
    AvailabilityStatus,
    ConfidenceLevel,
    FileFormat,
    ItemType,
    OfferBasis,
    PriceStatus,
    ProcessingStatus,
    ReviewStatus,
    WorkflowType,
)
from app.db.session import SessionFactory
from app.documents.product_parser import (
    ParsedProductLine,
    ProductColumnMappingRequiredError,
    UnsupportedProductDocumentError,
    parse_product_document,
)
from app.documents.storage import get_document_format
from app.llm.client import (
    LLMInputLimitError,
    LLMJobBudget,
    OpenAILLM,
    create_llm_client,
)
from app.llm.schemas import ProductColumnMapping
from app.matching.service import (
    candidate_constraint_issues,
    match_product_line,
    write_match_candidates,
)
from app.models import (
    CatalogImport,
    Document,
    ExtractedPosition,
    Organization,
    PositionMatchResult,
    ProcessingJob,
    QuoteDraft,
    QuoteLine,
)

logger = logging.getLogger(__name__)
POLL_INTERVAL_SECONDS = 1.0


async def _claim_job(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: UUID | None = None,
) -> UUID | None:
    async with session_factory() as session:
        async with session.begin():
            statement = select(ProcessingJob).where(
                ProcessingJob.status == ProcessingStatus.UPLOADED
            )
            if job_id is not None:
                statement = statement.where(ProcessingJob.id == job_id)
            job = await session.scalar(
                statement.order_by(ProcessingJob.created_at)
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            if job is None:
                return None

            document = await session.get(Document, job.document_id)
            if document is None:
                job.status = ProcessingStatus.FAILED
                job.error_code = "DOCUMENT_NOT_FOUND"
                job.error_message = "Izvorni dokument nije pronađen."
                job.finished_at = datetime.now(timezone.utc)
                return job.id

            job.status = ProcessingStatus.PROCESSING
            job.attempts += 1
            job.started_at = datetime.now(timezone.utc)
            job.error_code = None
            job.error_message = None
            document.status = ProcessingStatus.PROCESSING
            return job.id


async def _load_job_context(
    session: AsyncSession,
    job_id: UUID,
) -> tuple[ProcessingJob, Document, CatalogImport]:
    job = await session.get(ProcessingJob, job_id)
    if job is None:
        raise UnsupportedProductDocumentError("Processing posao nije pronađen.")
    document = await session.get(Document, job.document_id)
    catalog_import = await session.get(CatalogImport, job.catalog_import_id)
    if document is None:
        raise UnsupportedProductDocumentError("Izvorni dokument nije pronađen.")
    if catalog_import is None:
        raise UnsupportedProductDocumentError("Snapshot kataloga nije dostupan.")
    if document.workflow is not WorkflowType.PRODUCT_QUOTE:
        raise UnsupportedProductDocumentError("Technical Quoting obrada još nije implementirana.")
    if get_document_format(document) not in {FileFormat.CSV, FileFormat.XLSX}:
        raise UnsupportedProductDocumentError("Product obrada trenutno podržava CSV i XLSX.")
    return job, document, catalog_import


def _validated_mapping_suggestion(
    suggestion: ProductColumnMapping | None,
    headers: list[str],
) -> dict[str, int | None] | None:
    if suggestion is None:
        return None
    mapping = suggestion.model_dump()
    if any(index is not None and index >= len(headers) for index in mapping.values()):
        return None
    return mapping


async def _mark_job_mapping_required(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: UUID,
    *,
    headers: list[str],
    suggestion: dict[str, int | None] | None,
    token_budget: LLMJobBudget,
) -> None:
    async with session_factory() as session:
        async with session.begin():
            job = await session.get(ProcessingJob, job_id)
            if job is None:
                return
            document = await session.get(Document, job.document_id)
            job.status = ProcessingStatus.MAPPING_REQUIRED
            job.error_code = "MAPPING_REQUIRED"
            job.error_message = "Potvrdite mapiranje kolona pre nastavka obrade."
            job.mapping_headers = headers
            job.mapping_suggestion = suggestion
            job.llm_input_tokens = token_budget.input_tokens
            job.llm_output_tokens = token_budget.output_tokens
            job.finished_at = datetime.now(timezone.utc)
            if document is not None:
                document.status = ProcessingStatus.MAPPING_REQUIRED


async def _persist_llm_usage(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: UUID,
    token_budget: LLMJobBudget,
) -> None:
    async with session_factory() as session:
        async with session.begin():
            job = await session.get(ProcessingJob, job_id)
            if job is not None:
                job.llm_input_tokens = token_budget.input_tokens
                job.llm_output_tokens = token_budget.output_tokens


async def _write_processing_results(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    job_id: UUID,
    lines: list[ParsedProductLine],
    llm_client: OpenAILLM | None,
) -> None:
    settings = get_settings()
    async with session_factory() as session:
        async with session.begin():
            job, document, catalog_import = await _load_job_context(session, job_id)
            organization = await session.get(Organization, settings.local_organization_id)
            if organization is None:
                raise UnsupportedProductDocumentError("Lokalna organizacija nije pronađena.")
            quote_draft = await session.scalar(
                select(QuoteDraft)
                .where(
                    QuoteDraft.organization_id == settings.local_organization_id,
                    QuoteDraft.document_id == document.id,
                    QuoteDraft.catalog_snapshot_id == catalog_import.id,
                )
                .order_by(QuoteDraft.created_at.desc())
                .limit(1)
            )
            if quote_draft is None:
                quote_draft = QuoteDraft(
                    organization_id=settings.local_organization_id,
                    document_id=document.id,
                    workflow=WorkflowType.PRODUCT_QUOTE,
                    offer_basis=OfferBasis.SUPPLY_ONLY,
                    currency=organization.default_currency,
                    status=ApprovalState.NEEDS_REVIEW,
                    catalog_snapshot_id=catalog_import.id,
                )
                session.add(quote_draft)
                await session.flush()

            positions_to_write = [
                ExtractedPosition(
                    organization_id=settings.local_organization_id,
                    document_id=document.id,
                    position_code=line.position_code,
                    sort_order=sort_order,
                    raw_description=line.raw_description,
                    item_type=ItemType.PRODUCT,
                    original_quantity=line.quantity,
                    original_unit=line.unit,
                    source_ref=line.source_ref,
                    flags=line.flags,
                )
                for sort_order, line in enumerate(lines, start=1)
            ]
            session.add_all(positions_to_write)
            await session.flush()

            for position, line in zip(positions_to_write, lines, strict=True):
                invalid_input = any(
                    flag
                    in {
                        "INVALID_QUANTITY",
                        "MISSING_QUANTITY",
                        "MISSING_UNIT",
                        "MISSING_DESCRIPTION",
                    }
                    for flag in line.flags
                )
                if invalid_input:
                    decision_status = ReviewStatus.INVALID_INPUT
                    confidence = ConfidenceLevel.NONE
                    reason_codes = list(line.flags)
                    candidates = []
                    selected_product_id = None
                    price_status = PriceStatus.NOT_CHECKED
                else:
                    decision = await match_product_line(
                        session,
                        organization_id=settings.local_organization_id,
                        catalog_import_id=catalog_import.id,
                        line=line,
                    )
                    decision_status = decision.status
                    confidence = decision.confidence
                    reason_codes = decision.reason_codes
                    candidates = decision.candidates
                    selected_product_id = (
                        decision.selected_product.id
                        if decision.selected_product is not None
                        else None
                    )
                    price_status = decision.price_status
                    has_hard_conflict = any(
                        reason
                        in {
                            "SPECIFICATION_CONFLICT",
                            "SPECIFICATION_UNKNOWN",
                            "UNIT_MISMATCH",
                        }
                        for reason in reason_codes
                    )
                    if (
                        llm_client is not None
                        and candidates
                        and decision.status is not ReviewStatus.EXACT_MATCH
                        and not has_hard_conflict
                    ):
                        candidate_ids = {
                            f"c{index}": candidate
                            for index, candidate in enumerate(candidates)
                        }
                        try:
                            llm_decision, _ = await llm_client.resolve_product_candidate(
                                description=line.raw_description,
                                requested_sku=line.source_sku,
                                requested_unit=line.unit,
                                candidates=[
                                    {
                                        "id": candidate_id,
                                        "sku": candidate.product.sku,
                                        "name": candidate.product.name,
                                        "unit": candidate.product.unit,
                                    }
                                    for candidate_id, candidate in candidate_ids.items()
                                ],
                            )
                        except LLMInputLimitError as error:
                            llm_decision = None
                            reason_codes.append(str(error))

                        if llm_decision is not None:
                            if llm_decision.decision == "MATCH":
                                selected_candidate = candidate_ids.get(
                                    llm_decision.selected_candidate_id or ""
                                )
                                candidate_issues = (
                                    candidate_constraint_issues(line, selected_candidate.product)
                                    if selected_candidate is not None
                                    else ["INVALID_LLM_SELECTION"]
                                )
                                if selected_candidate is not None and not candidate_issues:
                                    decision_status = ReviewStatus.SUGGESTED_MATCH
                                    confidence = ConfidenceLevel.MEDIUM
                                    selected_product_id = selected_candidate.product.id
                                    price_status = (
                                        PriceStatus.AVAILABLE
                                        if selected_candidate.product.price is not None
                                        else PriceStatus.MISSING_PRICE
                                    )
                                    reason_codes = [
                                        "LLM_MATCH_SUGGESTION",
                                        "HUMAN_CONFIRMATION_REQUIRED",
                                        *[
                                            f"LLM_REASON_{reason}"
                                            for reason in llm_decision.reason_codes
                                        ],
                                        *[
                                            f"LLM_MISSING_{attribute.upper()}"
                                            for attribute in llm_decision.missing_attributes
                                        ],
                                    ]
                                    if price_status is PriceStatus.MISSING_PRICE:
                                        reason_codes.append("MISSING_PRICE")
                            elif llm_decision.decision == "NO_MATCH":
                                decision_status = ReviewStatus.AMBIGUOUS
                                confidence = ConfidenceLevel.LOW
                                selected_product_id = None
                                reason_codes = ["LLM_NO_MATCH_IN_TOP_CANDIDATES"]
                            else:
                                decision_status = ReviewStatus.AMBIGUOUS
                                confidence = ConfidenceLevel.LOW
                                selected_product_id = None
                                reason_codes = [f"LLM_{llm_decision.decision}"]

                await write_match_candidates(
                    session,
                    organization_id=settings.local_organization_id,
                    extracted_position_id=position.id,
                    candidates=candidates,
                )
                session.add(
                    PositionMatchResult(
                        organization_id=settings.local_organization_id,
                        processing_job_id=job.id,
                        extracted_position_id=position.id,
                        selected_product_id=selected_product_id,
                        match_status=decision_status,
                        confidence=confidence,
                        reason_codes=reason_codes,
                        price_status=price_status,
                        availability_status=AvailabilityStatus.UNKNOWN,
                    )
                )
                session.add(
                    QuoteLine(
                        organization_id=settings.local_organization_id,
                        quote_draft_id=quote_draft.id,
                        extracted_position_id=position.id,
                        position_code=position.position_code,
                        item_type=ItemType.PRODUCT,
                        review_status=decision_status,
                        notes="Predlog obrade; potrebna je ljudska provera.",
                    )
                )

            job.status = ProcessingStatus.NEEDS_REVIEW
            job.result_count = len(lines)
            job.finished_at = datetime.now(timezone.utc)
            if llm_client is not None:
                job.llm_input_tokens = llm_client.job_budget.input_tokens
                job.llm_output_tokens = llm_client.job_budget.output_tokens
            document.status = ProcessingStatus.NEEDS_REVIEW


async def process_job(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: UUID,
) -> bool:
    settings = get_settings()
    async with session_factory() as session:
        context = await _load_job_context(session, job_id)
        job, document, _ = context
        content_path = get_settings().document_storage_path / document.object_key
        if not content_path.is_file():
            raise UnsupportedProductDocumentError("Originalni fajl nije pronađen u storage-u.")
        file_bytes = content_path.read_bytes()
        document_id = document.id
        filename = document.original_filename
        column_mapping = job.column_mapping
        token_budget = LLMJobBudget(
            settings.llm_job_max_tokens,
            input_tokens=job.llm_input_tokens,
            output_tokens=job.llm_output_tokens,
        )

    llm_client = create_llm_client(settings, job_budget=token_budget)
    try:
        try:
            lines, _ = parse_product_document(
                document_id=document_id,
                filename=filename,
                file_bytes=file_bytes,
                column_mapping=column_mapping,
            )
        except ProductColumnMappingRequiredError as error:
            suggestion = None
            if llm_client is not None:
                try:
                    mapped, _ = await llm_client.suggest_column_mapping(
                        headers=error.headers,
                        sample_rows=error.sample_rows,
                    )
                    suggestion = _validated_mapping_suggestion(mapped, error.headers)
                except LLMInputLimitError:
                    logger.info("LLM mapping request exceeded its token budget for job %s", job_id)
            await _mark_job_mapping_required(
                session_factory,
                job_id,
                headers=error.headers,
                suggestion=suggestion,
                token_budget=token_budget,
            )
            return True

        await _write_processing_results(
            session_factory,
            job_id=job_id,
            lines=lines,
            llm_client=llm_client,
        )
        return True
    finally:
        if llm_client is not None:
            try:
                await _persist_llm_usage(session_factory, job_id, llm_client.job_budget)
            except Exception:
                logger.exception("Could not persist LLM usage for processing job %s", job_id)
            finally:
                await llm_client.close()


async def process_next_job(
    session_factory: async_sessionmaker[AsyncSession] = SessionFactory,
    job_id: UUID | None = None,
) -> bool:
    claimed_job_id = await _claim_job(session_factory, job_id)
    if claimed_job_id is None:
        return False

    try:
        await process_job(session_factory, claimed_job_id)
    except UnsupportedProductDocumentError as error:
        await _mark_job_failed(
            session_factory,
            claimed_job_id,
            status=ProcessingStatus.UNSUPPORTED_INPUT,
            code="UNSUPPORTED_INPUT",
            message=str(error),
        )
    except Exception as error:
        logger.exception("Catalog matching failed for processing job %s", claimed_job_id)
        await _mark_job_failed(
            session_factory,
            claimed_job_id,
            status=ProcessingStatus.FAILED,
            code="PROCESSING_FAILED",
            message=f"Obrada nije uspela: {type(error).__name__}.",
        )
    return True


async def _mark_job_failed(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: UUID,
    *,
    status: ProcessingStatus,
    code: str,
    message: str,
) -> None:
    async with session_factory() as session:
        async with session.begin():
            job = await session.get(ProcessingJob, job_id)
            if job is None:
                return
            document = await session.get(Document, job.document_id)
            job.status = status
            job.error_code = code
            job.error_message = message
            job.finished_at = datetime.now(timezone.utc)
            if document is not None:
                document.status = status


async def run_worker() -> None:
    while True:
        processed = await process_next_job()
        if not processed:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
