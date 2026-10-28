# AI Inbox-to-Quote API

FastAPI backend for the Product Quoting and Technical Quoting workflows.
Document upload, listing, source-content, and catalog CSV/XLSX import endpoints are available
for the local workspace. Deterministic Product Quoting processing supports CSV/XLSX input and
returns reviewable catalog matches. Technical Quoting, PDF/EML processing, approval, and export
remain unsupported.

## Local setup

```sh
cd services/api
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[dev]'
cp .env.example .env
docker compose -f ../../infra/docker-compose.yml up -d postgres
alembic upgrade head
uvicorn app.main:app --reload
```

In a second terminal, start the processing worker from `services/api`:

```sh
. .venv/bin/activate
python -m app.jobs.worker
```

Alternatively, `docker compose -f ../../infra/docker-compose.yml up -d` starts PostgreSQL, the API,
and the worker with shared document storage.

OpenAPI docs are available at `/docs` while running locally. The default database URL is for
local development only. Uploaded files and metadata use a local filesystem directory or the
Compose `document_files` volume. This is not production storage, authentication, or tenant isolation;
only synthetic files should be uploaded.

## Checks

```sh
pytest
ruff check .
```

## Database migrations

The initial migration creates the SQLAlchemy schema. Apply it to a fresh local database with
`alembic upgrade head`; inspect the active revision with `alembic current` and check for model
drift with `alembic check`.

For future model changes, generate a revision with `alembic revision --autogenerate -m "describe change"`,
review the generated operations, then apply with `alembic upgrade head`. Do not edit the database
schema manually or create tables from application startup.

## Catalog import

`POST /api/v1/catalog/imports` accepts multipart fields `file`, `mapping` (JSON string of
source-column indexes), and optional `sheet_name` for XLSX. Required mapped fields are `sku`,
`name`, and `unit`; optional fields are `price`, `currency`, `vat_rate`, and `aliases`. The API
re-parses and validates the original file, creates a versioned `CatalogImport`, and inserts
`Product` and `ProductAlias` rows in one transaction. `GET /api/v1/catalog/imports` lists versions;
`GET /api/v1/catalog/products` lists products from the latest import or a selected
`catalog_import_id`.

For this local-only stage, imports are assigned to `LOCAL_ORGANIZATION_ID` from server settings,
not from browser input. The original catalog file is not retained; only its SHA-256 checksum and
normalized database records are stored. There is no auth/RBAC or real tenant isolation, so use
synthetic files only. XLSX formulas/macros are not executed; cached formula values may be used.

## Product document processing

`POST /api/v1/documents/{document_id}/process` creates or reuses a processing job pinned to the
latest catalog import. The worker parses CSV/XLSX rows, preserves source row references, and stores
exact matches, suggestions, ambiguous candidates, unmatched rows, and invalid input for review.
Poll `GET /api/v1/jobs/{job_id}` and load `GET /api/v1/documents/{document_id}/positions?job_id=...`.

LLM support is optional. Set `OPENAI_API_KEY` in `services/api/.env`; Compose passes it to both the
API and worker. `OPENAI_MODEL` defaults to `gpt-4.1-mini` and `LLM_JOB_MAX_TOKENS` defaults to
`30000`. Without a key, processing remains deterministic.

When CSV/XLSX headers are not recognized, the worker can ask the model to suggest a column map
using the headers and at most five sample rows. The job waits in `MAPPING_REQUIRED` until a user
confirms or changes the suggestion. For unresolved product matching, the model sees the request
and at most five candidates already retrieved from the pinned catalog. The backend validates its
candidate ID and rechecks units/specifications; a model match remains a human-review suggestion.
Prices, inventory, and organization data are not sent to the model. Price data shown to the user is
only the imported catalog value, and availability remains `UNKNOWN` because no inventory service
is configured.

The worker and API must share the same database and document storage volume.
