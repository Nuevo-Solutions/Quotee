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

`POST /api/v1/catalog/imports` accepts `file`; `mapping` (JSON string of source-column indexes)
and `sheet_name` are optional advanced overrides. By default the backend finds the data-bearing
worksheet and header row, validates SKU/name/unit cells, and imports active status when present.
The API creates a versioned `CatalogImport` and inserts `Product` and `ProductAlias` rows in one
transaction. `GET /api/v1/catalog/imports` lists versions; `GET /api/v1/catalog/products` lists
products from the latest import or a selected `catalog_import_id`.

For this local-only stage, imports are assigned to `LOCAL_ORGANIZATION_ID` from server settings,
not from browser input. The original catalog file is not retained; only its SHA-256 checksum and
normalized database records are stored. There is no auth/RBAC or real tenant isolation, so use
synthetic files only. XLSX formulas/macros are not executed; cached formula values may be used.

## Product document processing

`POST /api/v1/documents/{document_id}/process` creates or reuses a processing job pinned to the
latest catalog import. The worker scans CSV/XLSX sheets for data-backed headers and table rows,
preserves source coordinates, and stores matches and partial-input states separately. Poll
`GET /api/v1/jobs/{job_id}` and load
`GET /api/v1/documents/{document_id}/positions?job_id=...`.

LLM support is optional. Set `OPENAI_API_KEY` in `services/api/.env`; Compose passes it to both the
API and worker. `OPENAI_MODEL` defaults to `gpt-4.1-mini` and `LLM_JOB_MAX_TOKENS` defaults to
`30000`. Without a key, processing remains deterministic.

Rules handle recognized CSV/XLSX layouts without an LLM call. If rules cannot find a valid header,
the worker can ask the model for a bounded column suggestion and trial-parse it. Manual column
confirmation is requested only if that parse cannot be validated. Catalog import also detects the
data-bearing sheet/header automatically; mapping and sheet selection are optional overrides. For
unresolved product matching, the model sees the request and at most five candidates already
retrieved from the pinned catalog. The backend checks candidate specifications/units before
truncation, validates the selected ID, and keeps any model match as a human-review suggestion.
Missing quantities do not block product identity. Prices, inventory, and organization data are not
sent to the model. Availability remains `UNKNOWN` because no inventory service is configured.

The worker and API must share the same database and document storage volume.
