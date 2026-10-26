# AI Inbox-to-Quote API

FastAPI backend scaffold for the Product Quoting and Technical Quoting workflows.
Document upload, listing, and source-content endpoints are available for local development.
Catalog CSV/XLSX import and product listing are also available for the local workspace.
Quote processing and other business endpoints remain placeholders and return HTTP 501.

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
