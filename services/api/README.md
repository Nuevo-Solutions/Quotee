# AI Inbox-to-Quote API

FastAPI backend scaffold for the Product Quoting and Technical Quoting workflows.
Document upload, listing, and source-content endpoints are available for local development.
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
