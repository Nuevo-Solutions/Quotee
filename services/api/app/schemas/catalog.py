from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


class CatalogColumnMapping(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: int = Field(ge=0)
    name: int = Field(ge=0)
    unit: int = Field(ge=0)
    price: int | None = Field(default=None, ge=0)
    currency: int | None = Field(default=None, ge=0)
    vat_rate: int | None = Field(default=None, ge=0)
    aliases: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def mapping_uses_distinct_columns(self) -> "CatalogColumnMapping":
        indices = [index for index in self.model_dump().values() if index is not None]
        if len(indices) != len(set(indices)):
            raise ValueError("Svako polje mora biti mapirano na zasebnu kolonu.")
        return self


class CatalogProductInput(BaseModel):
    source_row: int
    sku: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    price: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=4)
    currency: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=3, max_length=3),
    ] | None = None
    vat_rate: Decimal | None = Field(default=None, ge=0, le=100, max_digits=7, decimal_places=4)
    aliases: list[Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]] = Field(
        default_factory=list,
        max_length=50,
    )


class CatalogImportResponse(BaseModel):
    id: UUID
    version: int
    status: str
    original_filename: str
    sheet_name: str | None
    checksum: str
    products_imported: int
    aliases_imported: int
    created_at: datetime


class CatalogImportListItem(BaseModel):
    id: UUID
    version: int
    status: str
    checksum: str | None
    products_imported: int
    aliases_imported: int
    created_at: datetime


class CatalogProductRead(BaseModel):
    id: UUID
    sku: str
    name: str
    unit: str
    price: Decimal | None
    currency: str | None
    vat_rate: Decimal | None
    aliases: list[str]
