from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ProductColumnMapping(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position: int | None = Field(default=None, ge=0)
    sku: int | None = Field(default=None, ge=0)
    description: int | None = Field(default=None, ge=0)
    quantity: int | None = Field(default=None, ge=0)
    unit: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def require_identifying_column(self) -> ProductColumnMapping:
        if self.sku is None and self.description is None:
            raise ValueError("Mapirajte SKU ili opis proizvoda.")
        mapped_indexes = [
            value
            for value in (
                self.position,
                self.sku,
                self.description,
                self.quantity,
                self.unit,
            )
            if value is not None
        ]
        if len(mapped_indexes) != len(set(mapped_indexes)):
            raise ValueError("Ista kolona ne može biti mapirana na više polja.")
        return self


class ProductCandidateDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["MATCH", "AMBIGUOUS", "NO_MATCH"]
    selected_candidate_id: str | None
    reason_codes: list[
        Literal[
            "DESCRIPTION_MATCH",
            "SKU_SUPPORTS_MATCH",
            "UNIT_MATCH",
            "SPECIFICATION_MATCH",
            "INSUFFICIENT_INFORMATION",
            "SPECIFICATION_CONFLICT",
            "UNIT_CONFLICT",
        ]
    ]
    missing_attributes: list[str]