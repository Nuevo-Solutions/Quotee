import unicodedata
from collections.abc import Callable
from dataclasses import dataclass

MAX_HEADER_SCAN_ROWS = 50
MAX_LAYOUT_COLUMNS = 50
HEADER_SAMPLE_ROWS = 5
SERBIAN_CYRILLIC = str.maketrans(
    {
        "а": "a",
        "б": "b",
        "в": "v",
        "г": "g",
        "д": "d",
        "ђ": "dj",
        "е": "e",
        "ж": "z",
        "з": "z",
        "и": "i",
        "ј": "j",
        "к": "k",
        "л": "l",
        "љ": "lj",
        "м": "m",
        "н": "n",
        "њ": "nj",
        "о": "o",
        "п": "p",
        "р": "r",
        "с": "s",
        "т": "t",
        "ћ": "c",
        "у": "u",
        "ф": "f",
        "х": "h",
        "ц": "c",
        "ч": "c",
        "џ": "dz",
        "ш": "s",
    }
)


@dataclass(frozen=True)
class HeaderCandidate:
    row_index: int
    columns: dict[str, int]
    score: int
    supporting_rows: int


def normalize_header(value: object) -> str:
    raw = "" if value is None else str(value).strip().casefold()
    decomposed = unicodedata.normalize("NFKD", raw)
    without_marks = "".join(
        character for character in decomposed if unicodedata.category(character) != "Mn"
    )
    transliterated = without_marks.translate(SERBIAN_CYRILLIC)
    return "".join(character for character in transliterated if character.isalnum())


def find_header_candidates(
    rows: list[list[object]],
    *,
    aliases: dict[str, set[str]],
    identity_fields: set[str],
    minimum_fields: int,
    row_validator: Callable[[list[object], dict[str, int]], bool],
) -> list[HeaderCandidate]:
    normalized_aliases = {
        field: {normalize_header(alias) for alias in field_aliases}
        for field, field_aliases in aliases.items()
    }
    candidates: list[HeaderCandidate] = []

    for row_index, row in enumerate(rows[:MAX_HEADER_SCAN_ROWS]):
        columns: dict[str, int] = {}
        for column_index, value in enumerate(row[:MAX_LAYOUT_COLUMNS]):
            normalized = normalize_header(value)
            for field, field_aliases in normalized_aliases.items():
                if normalized in field_aliases and field not in columns:
                    columns[field] = column_index

        if len(columns) < minimum_fields or not identity_fields.intersection(columns):
            continue

        supporting_rows = sum(
            row_validator(sample_row, columns)
            for sample_row in rows[row_index + 1 : row_index + 1 + HEADER_SAMPLE_ROWS]
        )
        if supporting_rows == 0:
            continue

        candidates.append(
            HeaderCandidate(
                row_index=row_index,
                columns=columns,
                score=len(columns) * 10 + supporting_rows,
                supporting_rows=supporting_rows,
            )
        )

    return sorted(candidates, key=lambda candidate: (-candidate.score, candidate.row_index))


def best_preview_row(rows: list[list[object]]) -> int:
    scan_rows = rows[:MAX_HEADER_SCAN_ROWS]
    if not scan_rows:
        return 0
    return max(
        range(len(scan_rows)),
        key=lambda row_index: (
            sum(
                value is not None and bool(str(value).strip())
                for value in scan_rows[row_index][:MAX_LAYOUT_COLUMNS]
            ),
            -row_index,
        ),
    )