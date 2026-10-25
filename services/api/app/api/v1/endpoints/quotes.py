from typing import Literal
from uuid import UUID

from fastapi import APIRouter

from app.api.v1.endpoints._not_implemented import not_implemented
from app.schemas.domain import QuoteLineUpdate

router = APIRouter(prefix="/quotes", tags=["quotes"])


@router.get("/{quote_id}", status_code=501)
async def get_quote(quote_id: UUID) -> None:
    not_implemented("Quote draft retrieval")


@router.patch("/{quote_id}/lines/{line_id}", status_code=501)
async def update_quote_line(
    quote_id: UUID,
    line_id: UUID,
    changes: QuoteLineUpdate,
) -> None:
    not_implemented("Quote line review")


@router.post("/{quote_id}/approve", status_code=501)
async def approve_quote(quote_id: UUID) -> None:
    not_implemented("Quote approval")


@router.get("/{quote_id}/export", status_code=501)
async def export_quote(quote_id: UUID, format: Literal["pdf", "csv"] = "pdf") -> None:
    not_implemented("Quote export")
