import csv
import io
import re
import zipfile
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from uuid import UUID

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException


class UnsupportedProductDocumentError(ValueError):
    pass


class ProductColumnMappingRequiredError(UnsupportedProductDocumentError):
    def __init__(self, headers: list[str], sample_rows: list[list[str]]) -> None:
        super().__init__("Potrebno je potvrditi mapiranje kolona.")
        self.headers = headers
        self.sample_rows = sample_rows


@dataclass(frozen=True)
class ParsedProductLine:
    position_code: str | None
    raw_description: str
    quantity: Decimal | None
    unit: str | None
    source_sku: str | None
    source_ref: dict[str, object]
    flags: list[str]


HEADER_ALIASES = {
    "position": {"position", "pozicija", "poz", "red", "rbr", "line"},
    "sku": {"sku", "sifra", "sifraartikla", "code", "productcode"},
    "description": {
        "description",
        "opis",
        "naziv",
        "proizvod",
        "name",
        "artikal",
        "artikl",
        "item",
    },
    "quantity": {"quantity", "kolicina", "qty", "kol"},
    "unit": {"unit", "jedinica", "jedinicamere", "jm", "um", "measure"},
}
QUANTITY_PATTERN = re.compile(r"^\s*[-+]?\d+(?:[.,]\d+)?\s*$")
MAX_PRODUCT_POSITIONS = 100
MAX_MAPPABLE_COLUMNS = 10


def normalize_header(value: object) -> str:
    text = "" if value is None else str(value)
    return (
        text.strip()
        .casefold()
        .replace("š", "s")
        .replace("đ", "d")
        .replace("č", "c")
        .replace("ć", "c")
        .replace("ž", "z")
        .replace(" ", "")
        .replace("_", "")
        .replace("-", "")
    )


def _column_map(header: list[object]) -> dict[str, int]:
    columns: dict[str, int] = {}
    for index, cell in enumerate(header):
        normalized = normalize_header(cell)
        for field, aliases in HEADER_ALIASES.items():
            if normalized in aliases and field not in columns:
                columns[field] = index
    return columns


def _read_csv(file_bytes: bytes) -> list[list[object]]:
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise UnsupportedProductDocumentError("CSV mora biti kodiran kao UTF-8.") from error

    try:
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    try:
        return [
            list(row) for row in csv.reader(io.StringIO(text, newline=""), dialect, strict=True)
        ]
    except csv.Error as error:
        raise UnsupportedProductDocumentError("CSV struktura nije validna.") from error


def _read_xlsx(file_bytes: bytes) -> tuple[str, list[list[object]]]:
    if not zipfile.is_zipfile(io.BytesIO(file_bytes)):
        raise UnsupportedProductDocumentError("XLSX fajl nije validna Excel radna sveska.")
    try:
        workbook = load_workbook(
            io.BytesIO(file_bytes),
            read_only=True,
            data_only=True,
            keep_links=False,
        )
    except (InvalidFileException, OSError, ValueError) as error:
        raise UnsupportedProductDocumentError("XLSX fajl nije moguće otvoriti.") from error

    try:
        worksheet = workbook.worksheets[0]
        rows = [list(row) for row in worksheet.iter_rows(values_only=True)]
        return worksheet.title, rows
    finally:
        workbook.close()


def _quantity_value(value: object, row_number: int) -> tuple[Decimal | None, list[str]]:
    if value is None or str(value).strip() == "":
        return None, ["MISSING_QUANTITY"]

    raw_value = str(value).strip()
    if not QUANTITY_PATTERN.fullmatch(raw_value):
        return None, ["INVALID_QUANTITY"]

    try:
        quantity = Decimal(raw_value.replace(",", "."))
    except InvalidOperation:
        return None, ["INVALID_QUANTITY"]
    if not quantity.is_finite() or quantity <= 0:
        return quantity, ["INVALID_QUANTITY"]
    return quantity, []


def parse_product_document(
    *,
    document_id: UUID,
    filename: str,
    file_bytes: bytes,
    column_mapping: dict[str, int | None] | None = None,
) -> tuple[list[ParsedProductLine], str | None]:
    extension = Path(filename).suffix.lower()
    if extension == ".csv":
        rows = _read_csv(file_bytes)
        sheet_name = None
    elif extension == ".xlsx":
        sheet_name, rows = _read_xlsx(file_bytes)
    else:
        raise UnsupportedProductDocumentError("Product obrada trenutno podržava CSV i XLSX.")

    if not rows:
        raise UnsupportedProductDocumentError("Dokument nema redove za obradu.")

    if column_mapping is None:
        columns = _column_map(rows[0])
    else:
        columns = {}
        for field, column_index in column_mapping.items():
            if column_index is None:
                continue
            if field not in HEADER_ALIASES or not 0 <= column_index < MAX_MAPPABLE_COLUMNS:
                raise UnsupportedProductDocumentError("Mapiranje kolona nije validno.")
            columns[field] = column_index
    if "description" not in columns and "sku" not in columns:
        headers = [
            "" if value is None else str(value).strip()
            for value in rows[0][:MAX_MAPPABLE_COLUMNS]
        ]
        headers.extend([""] * (MAX_MAPPABLE_COLUMNS - len(headers)))
        raise ProductColumnMappingRequiredError(
            headers=headers,
            sample_rows=[
                ["" if value is None else str(value).strip() for value in row]
                for row in rows[1:6]
            ],
        )

    parsed_lines: list[ParsedProductLine] = []
    for row_number, row in enumerate(rows[1:], start=2):
        if not any(cell is not None and str(cell).strip() for cell in row):
            continue
        if len(parsed_lines) >= MAX_PRODUCT_POSITIONS:
            raise UnsupportedProductDocumentError(
                f"Product dokument prelazi lokalni limit od {MAX_PRODUCT_POSITIONS} pozicija."
            )

        def value_for(field: str) -> object | None:
            column_index = columns.get(field)
            return (
                row[column_index] if column_index is not None and column_index < len(row) else None
            )

        source_sku_value = value_for("sku")
        source_sku = str(source_sku_value).strip() if source_sku_value is not None else None
        description_value = value_for("description")
        description = str(description_value).strip() if description_value is not None else ""
        if not description:
            description = source_sku or ""

        quantity, flags = _quantity_value(value_for("quantity"), row_number)
        if not description:
            flags.append("MISSING_DESCRIPTION")
        unit_value = value_for("unit")
        unit = (
            str(unit_value).strip() if unit_value is not None and str(unit_value).strip() else None
        )
        if unit is None:
            flags.append("MISSING_UNIT")

        position_value = value_for("position")
        position_code = (
            str(position_value).strip()
            if position_value is not None and str(position_value).strip()
            else str(row_number - 1)
        )
        source_ref: dict[str, object] = {
            "document_id": str(document_id),
            "row": row_number,
            "columns": {field: index for field, index in columns.items()},
        }
        if sheet_name is not None:
            source_ref["sheet"] = sheet_name
        if source_sku:
            source_ref["sku"] = source_sku

        parsed_lines.append(
            ParsedProductLine(
                position_code=position_code,
                raw_description=description,
                quantity=quantity,
                unit=unit,
                source_sku=source_sku,
                source_ref=source_ref,
                flags=flags,
            )
        )

    if not parsed_lines:
        raise UnsupportedProductDocumentError("Nijedna stavka nije pronađena u dokumentu.")
    return parsed_lines, sheet_name
