import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from uuid import UUID

from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    AvailabilityStatus,
    ConfidenceLevel,
    PriceStatus,
    ReviewStatus,
)
from app.documents.product_parser import ParsedProductLine
from app.models import MatchCandidate, Product, ProductAlias

MAX_CANDIDATES = 5
TRIGRAM_THRESHOLD = 0.18
AUTO_SUGGEST_THRESHOLD = 0.45
MIN_CANDIDATE_GAP = 0.10
SPEC_PATTERN = re.compile(
    r"\b(?:[abc]\s*\d+|\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*mm2?)?|\d+\s*[pP])\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class RankedCandidate:
    product: Product
    score: float
    method: str
    alias: str | None = None


@dataclass(frozen=True)
class MatchDecision:
    status: ReviewStatus
    confidence: ConfidenceLevel
    reason_codes: list[str]
    selected_product: Product | None
    candidates: list[RankedCandidate]
    price_status: PriceStatus
    availability_status: AvailabilityStatus = AvailabilityStatus.UNKNOWN


def normalize_match_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.casefold())
    without_marks = "".join(
        character for character in normalized if unicodedata.category(character) != "Mn"
    )
    return " ".join(without_marks.replace("×", "x").split())


def _specification_tokens(value: str) -> set[str]:
    return {
        re.sub(r"\s+", "", token.replace(",", ".").lower()).replace("×", "x")
        for token in SPEC_PATTERN.findall(value)
    }


def _specification_issue(requested: str, candidate: str) -> str | None:
    requested_specs = _specification_tokens(requested)
    candidate_specs = _specification_tokens(candidate)
    if not requested_specs:
        return None
    if not candidate_specs:
        return "SPECIFICATION_UNKNOWN"
    if requested_specs != candidate_specs:
        return "SPECIFICATION_CONFLICT"
    return None


def _normalize_unit(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = normalize_match_text(value).replace(".", "")
    aliases = {
        "metar": "m",
        "metara": "m",
        "komad": "kom",
        "komada": "kom",
        "kom": "kom",
        "pausal": "pausal",
        "pausala": "pausal",
    }
    return aliases.get(normalized, normalized)


def candidate_constraint_issues(line: ParsedProductLine, product: Product) -> list[str]:
    issues: list[str] = []
    specification_issue = _specification_issue(line.raw_description, product.name)
    if specification_issue:
        issues.append(specification_issue)
    if (
        _normalize_unit(line.unit) is not None
        and _normalize_unit(product.unit) is not None
        and _normalize_unit(line.unit) != _normalize_unit(product.unit)
    ):
        issues.append("UNIT_MISMATCH")
    return issues


async def _rank_candidates(
    session: AsyncSession,
    *,
    organization_id: UUID,
    catalog_import_id: UUID,
    line: ParsedProductLine,
) -> list[RankedCandidate]:
    query = normalize_match_text(line.raw_description)
    source_sku = normalize_match_text(line.source_sku or "")
    base_filters = (
        Product.organization_id == organization_id,
        Product.catalog_import_id == catalog_import_id,
        Product.active.is_(True),
    )

    if source_sku:
        sku_matches = (
            await session.scalars(
                select(Product).where(*base_filters, func.lower(Product.sku) == source_sku).limit(2)
            )
        ).all()
        if sku_matches:
            return [
                RankedCandidate(product=product, score=1.0, method="EXACT_SKU")
                for product in sku_matches
            ]

    products = (
        await session.scalars(
            select(Product).where(*base_filters).order_by(Product.sku).limit(3000)
        )
    ).all()
    exact_name_matches = [
        product for product in products if normalize_match_text(product.name) == query
    ]
    exact_alias_rows = (
        await session.execute(
            select(ProductAlias.alias, Product)
            .join(Product, Product.id == ProductAlias.product_id)
            .where(
                ProductAlias.organization_id == organization_id,
                *base_filters,
            )
        )
    ).all()
    exact: dict[UUID, RankedCandidate] = {
        product.id: RankedCandidate(product=product, score=1.0, method="EXACT_NAME")
        for product in exact_name_matches
    }
    for alias, product in exact_alias_rows:
        if normalize_match_text(alias) != query:
            continue
        exact[product.id] = RankedCandidate(
            product=product,
            score=1.0,
            method="EXACT_ALIAS",
            alias=alias,
        )
    if exact:
        return list(exact.values())

    if session.get_bind().dialect.name == "postgresql":
        await session.execute(text(f"SET LOCAL pg_trgm.similarity_threshold = {TRIGRAM_THRESHOLD}"))
        alias_scores = (
            select(
                ProductAlias.product_id.label("product_id"),
                func.max(
                    func.similarity(ProductAlias.alias, line.raw_description)
                ).label("alias_score"),
            )
            .where(
                ProductAlias.organization_id == organization_id,
                ProductAlias.alias.op("%")(line.raw_description),
            )
            .group_by(ProductAlias.product_id)
            .subquery()
        )
        name_score = func.similarity(Product.name, line.raw_description)
        alias_score = func.coalesce(alias_scores.c.alias_score, 0.0)
        score = func.greatest(name_score, alias_score)
        rows = (
            await session.execute(
                select(Product, score)
                .outerjoin(alias_scores, alias_scores.c.product_id == Product.id)
                .where(
                    *base_filters,
                    or_(
                        Product.name.op("%")(line.raw_description),
                        alias_scores.c.product_id.is_not(None),
                    ),
                )
                .order_by(score.desc(), Product.sku)
                .limit(20)
            )
        ).all()
        return [
            RankedCandidate(
                product=product,
                score=float(similarity),
                method="TRIGRAM",
            )
            for product, similarity in rows
        ]

    ranked: list[RankedCandidate] = []
    for product in products:
        product_score = SequenceMatcher(None, query, normalize_match_text(product.name)).ratio()
        aliases = (
            await session.scalars(
                select(ProductAlias.alias).where(ProductAlias.product_id == product.id)
            )
        ).all()
        alias_scores = [
            (SequenceMatcher(None, query, normalize_match_text(alias)).ratio(), alias)
            for alias in aliases
        ]
        alias_score, alias = max(alias_scores, default=(0.0, None), key=lambda item: item[0])
        best_score = max(product_score, alias_score)
        if best_score >= TRIGRAM_THRESHOLD:
            ranked.append(
                RankedCandidate(
                    product=product,
                    score=best_score,
                    method=(
                        "NAME_SIMILARITY" if product_score >= alias_score else "ALIAS_SIMILARITY"
                    ),
                    alias=alias if alias_score > product_score else None,
                )
            )
    return sorted(ranked, key=lambda candidate: (-candidate.score, candidate.product.sku))[:20]


async def match_product_line(
    session: AsyncSession,
    *,
    organization_id: UUID,
    catalog_import_id: UUID,
    line: ParsedProductLine,
) -> MatchDecision:
    candidates = await _rank_candidates(
        session,
        organization_id=organization_id,
        catalog_import_id=catalog_import_id,
        line=line,
    )
    if not candidates:
        return MatchDecision(
            status=ReviewStatus.UNMATCHED,
            confidence=ConfidenceLevel.NONE,
            reason_codes=["NO_CATALOG_MATCH"],
            selected_product=None,
            candidates=[],
            price_status=PriceStatus.NOT_CHECKED,
        )

    top_candidates = candidates[:MAX_CANDIDATES]
    top = top_candidates[0]
    exact_candidate = top.method in {"EXACT_SKU", "EXACT_ALIAS", "EXACT_NAME"}
    constraint_issues = candidate_constraint_issues(line, top.product)
    if constraint_issues:
        status = ReviewStatus.AMBIGUOUS
        confidence = ConfidenceLevel.LOW
        selected_product = None
        reason_codes = [top.method, *constraint_issues]
    elif top.method == "EXACT_ALIAS":
        status = ReviewStatus.SUGGESTED_MATCH
        confidence = ConfidenceLevel.MEDIUM
        selected_product = top.product
        reason_codes = [top.method, "HUMAN_CONFIRMATION_REQUIRED"]
    elif exact_candidate and len(top_candidates) == 1:
        status = ReviewStatus.EXACT_MATCH
        confidence = ConfidenceLevel.HIGH
        selected_product = top.product
        reason_codes = [top.method, "UNIT_REVIEW_REQUIRED"]
    elif exact_candidate:
        status = ReviewStatus.AMBIGUOUS
        confidence = ConfidenceLevel.LOW
        selected_product = None
        reason_codes = [top.method, "MULTIPLE_EXACT_CANDIDATES"]
    elif top.score >= AUTO_SUGGEST_THRESHOLD and (
        len(top_candidates) == 1 or top.score - top_candidates[1].score >= MIN_CANDIDATE_GAP
    ):
        status = ReviewStatus.SUGGESTED_MATCH
        confidence = ConfidenceLevel.MEDIUM
        selected_product = top.product
        reason_codes = [top.method, "HUMAN_CONFIRMATION_REQUIRED"]
    else:
        status = ReviewStatus.AMBIGUOUS
        confidence = ConfidenceLevel.LOW
        selected_product = None
        reason_codes = [top.method, "MULTIPLE_CLOSE_CANDIDATES"]

    price_product = selected_product or top.product
    price_status = (
        PriceStatus.AVAILABLE if price_product.price is not None else PriceStatus.MISSING_PRICE
    )
    if price_status is PriceStatus.MISSING_PRICE:
        reason_codes.append("MISSING_PRICE")
    return MatchDecision(
        status=status,
        confidence=confidence,
        reason_codes=reason_codes,
        selected_product=selected_product,
        candidates=top_candidates,
        price_status=price_status,
    )


async def write_match_candidates(
    session: AsyncSession,
    *,
    organization_id: UUID,
    extracted_position_id: UUID,
    candidates: list[RankedCandidate],
) -> None:
    session.add_all(
        [
            MatchCandidate(
                organization_id=organization_id,
                extracted_position_id=extracted_position_id,
                product_id=candidate.product.id,
                rank=rank,
                evidence={
                    "method": candidate.method,
                    "similarity": round(candidate.score, 4),
                    "alias": candidate.alias,
                },
            )
            for rank, candidate in enumerate(candidates, start=1)
        ]
    )