from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import (
    Document,
    ExtractedPosition,
    MatchCandidate,
    PositionMatchResult,
    ProcessingJob,
    Product,
)
from app.schemas.domain import MatchCandidateRead, PositionMatchResultRead


async def list_document_positions(
    session: AsyncSession,
    *,
    document_id: UUID,
    job_id: UUID | None,
) -> list[PositionMatchResultRead]:
    organization_id = get_settings().local_organization_id
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == organization_id,
        )
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dokument nije pronađen.")

    if job_id is None:
        job_id = await session.scalar(
            select(ProcessingJob.id)
            .where(
                ProcessingJob.organization_id == organization_id,
                ProcessingJob.document_id == document_id,
            )
            .order_by(ProcessingJob.created_at.desc())
            .limit(1)
        )
    if job_id is None:
        return []

    job = await session.scalar(
        select(ProcessingJob).where(
            ProcessingJob.id == job_id,
            ProcessingJob.organization_id == organization_id,
            ProcessingJob.document_id == document_id,
        )
    )
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Processing posao nije pronađen."
        )

    result_rows = (
        await session.execute(
            select(PositionMatchResult, ExtractedPosition)
            .join(
                ExtractedPosition, ExtractedPosition.id == PositionMatchResult.extracted_position_id
            )
            .where(
                PositionMatchResult.organization_id == organization_id,
                PositionMatchResult.processing_job_id == job_id,
            )
            .order_by(ExtractedPosition.sort_order)
        )
    ).all()

    output: list[PositionMatchResultRead] = []
    for result, position in result_rows:
        quantity_status = (
            "INVALID"
            if "INVALID_QUANTITY" in position.flags
            else "MISSING"
            if "MISSING_QUANTITY" in position.flags
            else "VALID"
        )
        unit_status = (
            "CONFLICT"
            if "UNIT_MISMATCH" in result.reason_codes
            else "MISSING"
            if "MISSING_UNIT" in position.flags
            else "EXPLICIT"
        )
        candidates = (
            await session.execute(
                select(MatchCandidate, Product)
                .join(Product, Product.id == MatchCandidate.product_id)
                .where(
                    MatchCandidate.organization_id == organization_id,
                    MatchCandidate.extracted_position_id == position.id,
                )
                .order_by(MatchCandidate.rank)
            )
        ).all()
        output.append(
            PositionMatchResultRead(
                id=result.id,
                position_code=position.position_code,
                sort_order=position.sort_order,
                raw_description=position.raw_description,
                original_quantity=position.original_quantity,
                original_unit=position.original_unit,
                extraction_status="PARTIAL" if position.flags else "PARSED",
                quantity_status=quantity_status,
                unit_status=unit_status,
                source_ref=position.source_ref,
                item_type=position.item_type,
                review_status=result.match_status,
                confidence=result.confidence,
                reason_codes=result.reason_codes,
                price_status=result.price_status,
                availability_status=result.availability_status,
                selected_product_id=result.selected_product_id,
                candidates=[
                    MatchCandidateRead(
                        product_id=product.id,
                        sku=product.sku,
                        name=product.name,
                        unit=product.unit,
                        price=product.price,
                        currency=product.currency,
                        rank=candidate.rank,
                        evidence=candidate.evidence,
                    )
                    for candidate, product in candidates
                ],
            )
        )
    return output
