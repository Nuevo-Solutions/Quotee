import csv
import hashlib
import io
import re
import zipfile
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from pydantic import ValidationError

from app.schemas.catalog import CatalogColumnMapping, CatalogProductInput

MAX_CATALOG_PRODUCTS = 3000
MAX_ROW_ERRORS = 100
ALIAS_SEPARATOR = re.compile(r"[;|]")


class CatalogFileError(ValueError):
    pass


class CatalogValidationError(ValueError):
    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("; ".join(errors))


@dataclass(frozen=True)
class ParsedCatalog:
    checksum: str
    sheet_name: str | None
    products: list[CatalogProductInput]
    aliases_imported: int


def _cell_text(value: object) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, float):
        return str(Decimal(str(value)))
    return str(value).strip()


def _parse_decimal(value: str, field_label: str, row_number: int) -> Decimal | None:
    normalized = value.strip()
    if not normalized:
        return None

    normalized = normalized.replace(" ", "").replace("\u00a0", "")
    if "," in normalized and "." in normalized:
        if normalized.rfind(",") > normalized.rfind("."):
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    elif "," in normalized:
        normalized = normalized.replace(",", ".")

    try:
        result = Decimal(normalized)
    except InvalidOperation as error:
        raise ValueError(f"Red {row_number}: {field_label} nije validan decimalni broj.") from error

    if not result.is_finite():
        raise ValueError(f"Red {row_number}: {field_label} mora biti konačan broj.")
    return result


def _read_csv_rows(file_bytes: bytes) -> list[list[object]]:
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise CatalogFileError("CSV mora biti kodiran kao UTF-8.") from error

    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel

    return [list(row) for row in csv.reader(io.StringIO(text, newline=""), dialect)]


def _read_xlsx_rows(
    file_bytes: bytes,
    requested_sheet: str | None,
) -> tuple[str, list[list[object]]]:
    if not zipfile.is_zipfile(io.BytesIO(file_bytes)):
        raise CatalogFileError("XLSX fajl nije validna Excel radna sveska.")

    try:
        workbook = load_workbook(
            io.BytesIO(file_bytes),
            read_only=True,
            data_only=True,
            keep_links=False,
        )
    except (InvalidFileException, OSError, ValueError) as error:
        raise CatalogFileError("XLSX fajl nije moguće otvoriti.") from error

    try:
        if requested_sheet is None:
            worksheet = workbook.worksheets[0]
        elif requested_sheet not in workbook.sheetnames:
            raise CatalogFileError(f"Radni list '{requested_sheet}' ne postoji u XLSX fajlu.")
        else:
            worksheet = workbook[requested_sheet]

        rows = [list(row) for row in worksheet.iter_rows(values_only=True)]
        return worksheet.title, rows
    finally:
        workbook.close()


def parse_catalog_file(
    *,
    filename: str,
    file_bytes: bytes,
    mapping: CatalogColumnMapping,
    sheet_name: str | None = None,
) -> ParsedCatalog:
    suffix = Path(filename.replace("\\", "/")).suffix.lower()
    checksum = hashlib.sha256(file_bytes).hexdigest()

    if suffix == ".csv":
        if b"\x00" in file_bytes[:8192]:
            raise CatalogFileError("CSV mora biti tekstualni fajl.")
        if sheet_name is not None:
            raise CatalogFileError("sheet_name se može koristiti samo za XLSX fajlove.")
        source_rows = _read_csv_rows(file_bytes)
        selected_sheet = None
    elif suffix == ".xlsx":
        selected_sheet, source_rows = _read_xlsx_rows(file_bytes, sheet_name)
    else:
        raise CatalogFileError("Podržani formati kataloga su CSV i XLSX.")

    if not source_rows:
        raise CatalogFileError("Fajl je prazan.")

    headers = [_cell_text(value) for value in source_rows[0]]
    mapped_columns = [index for index in mapping.model_dump().values() if index is not None]
    if any(index >= len(headers) for index in mapped_columns):
        raise CatalogValidationError(["Mapiranje sadrži kolonu koja ne postoji u zaglavlju fajla."])
    if any(not headers[index] for index in mapped_columns):
        raise CatalogValidationError(["Izabrana kolona nema naziv u zaglavlju fajla."])

    products: list[CatalogProductInput] = []
    errors: list[str] = []
    seen_skus: set[str] = set()
    alias_count = 0

    for row_number, values in enumerate(source_rows[1:], start=2):
        row = [_cell_text(value) for value in values]
        if not any(row):
            continue
        if len(products) >= MAX_CATALOG_PRODUCTS:
            raise CatalogValidationError(
                [f"Katalog prelazi pilot limit od {MAX_CATALOG_PRODUCTS} proizvoda."]
            )

        def value_for(field: str) -> str:
            index = getattr(mapping, field)
            return row[index] if index is not None and index < len(row) else ""

        sku = value_for("sku")
        name = value_for("name")
        unit = value_for("unit")
        if not sku or not name or not unit:
            errors.append(f"Red {row_number}: SKU, naziv i jedinica mere su obavezni.")
            if len(errors) >= MAX_ROW_ERRORS:
                errors.append("Prikazano je prvih 100 grešaka.")
                break
            continue

        if sku in seen_skus:
            errors.append(f"Red {row_number}: SKU '{sku}' je dupliran u fajlu.")
            if len(errors) >= MAX_ROW_ERRORS:
                errors.append("Prikazano je prvih 100 grešaka.")
                break
            continue

        try:
            price = _parse_decimal(value_for("price"), "cena", row_number)
            vat_rate = _parse_decimal(value_for("vat_rate"), "PDV stopa", row_number)
        except ValueError as error:
            errors.append(str(error))
            if len(errors) >= MAX_ROW_ERRORS:
                errors.append("Prikazano je prvih 100 grešaka.")
                break
            continue

        aliases: list[str] = []
        seen_aliases: set[str] = set()
        for raw_alias in ALIAS_SEPARATOR.split(value_for("aliases")):
            alias = raw_alias.strip()
            normalized_alias = alias.casefold()
            if alias and normalized_alias not in seen_aliases:
                aliases.append(alias)
                seen_aliases.add(normalized_alias)
        try:
            product = CatalogProductInput(
                source_row=row_number,
                sku=sku,
                name=name,
                unit=unit,
                price=price,
                currency=(value_for("currency").upper() or None),
                vat_rate=vat_rate,
                aliases=aliases,
            )
        except ValidationError as error:
            errors.extend(
                f"Red {row_number}: {issue['msg']}"
                for issue in error.errors()
            )
            if len(errors) >= MAX_ROW_ERRORS:
                errors.append("Prikazano je prvih 100 grešaka.")
                break
            continue

        products.append(product)
        seen_skus.add(sku)
        alias_count += len(aliases)

    if errors:
        raise CatalogValidationError(errors)
    if not products:
        raise CatalogValidationError(["Nema validnih proizvoda za uvoz."])

    return ParsedCatalog(
        checksum=checksum,
        sheet_name=selected_sheet,
        products=products,
        aliases_imported=alias_count,
    )