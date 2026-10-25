from types import SimpleNamespace
from uuid import UUID

import httpx
import pytest

from app.db.base import Base
from app.documents import storage
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "AI Inbox-to-Quote API"}


@pytest.mark.asyncio
async def test_business_routes_are_documented_but_not_implemented() -> None:
    document_id = "4c4f734a-23cc-4c1b-a0ce-045645f8f8e0"
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(f"/api/v1/documents/{document_id}/process")
    paths = app.openapi()["paths"]

    assert response.status_code == 501
    assert "/api/v1/documents/{document_id}/process" in paths
    assert "/api/v1/documents/{document_id}/content" in paths
    assert "/api/v1/quotes/{quote_id}/approve" in paths
    assert "/api/v1/metrics/pilot" in paths


@pytest.mark.asyncio
async def test_document_upload_list_and_content(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(storage, "get_storage_directory", lambda: tmp_path)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        upload = await client.post(
            "/api/v1/documents",
            data={"document_type": "PRODUCT_LIST", "workflow": "PRODUCT_QUOTE"},
            files={"file": ("catalog.csv", b"sku,name\nA-1,Cable\n", "text/csv")},
        )

        assert upload.status_code == 201
        document = upload.json()
        document_id = document["id"]
        assert document["original_filename"] == "catalog.csv"
        assert document["size_bytes"] == len(b"sku,name\nA-1,Cable\n")
        assert document["workflow"] == "PRODUCT_QUOTE"

        listing = await client.get("/api/v1/documents", params={"workflow": "PRODUCT_QUOTE"})
        metadata = await client.get(f"/api/v1/documents/{document_id}")
        content = await client.get(f"/api/v1/documents/{document_id}/content")

    assert len(listing.json()) == 1
    assert listing.json()[0]["id"] == document_id
    assert metadata.status_code == 200
    assert metadata.json()["id"] == document_id
    assert content.content == b"sku,name\nA-1,Cable\n"
    assert UUID(document_id)


@pytest.mark.asyncio
async def test_pdf_source_content_is_inline(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(storage, "get_storage_directory", lambda: tmp_path)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        upload = await client.post(
            "/api/v1/documents",
            files={"file": ("source.pdf", b"%PDF-1.4 synthetic", "application/pdf")},
        )
        document_id = upload.json()["id"]
        content = await client.get(f"/api/v1/documents/{document_id}/content")

    assert upload.status_code == 201
    assert content.headers["content-disposition"].startswith("inline;")


@pytest.mark.asyncio
async def test_document_upload_rejects_invalid_file_signature(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(storage, "get_storage_directory", lambda: tmp_path)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/documents",
            files={"file": ("not-a-pdf.pdf", b"plain text", "application/pdf")},
        )

    assert response.status_code == 400
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_document_upload_enforces_size_limit_and_cleans_temporary_file(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr(
        storage,
        "get_settings",
        lambda: SimpleNamespace(
            document_storage_path=tmp_path,
            max_document_size_bytes=8,
        ),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/documents",
            files={"file": ("too-large.csv", b"sku,name\nA-1,Cable\n", "text/csv")},
        )

    assert response.status_code == 413
    assert list(tmp_path.iterdir()) == []


def test_domain_models_register_with_shared_metadata() -> None:
    import app.models  # noqa: F401

    expected_tables = {
        "organizations",
        "documents",
        "source_sections",
        "extracted_positions",
        "quote_drafts",
        "quote_lines",
        "quote_versions",
        "audit_events",
    }

    assert expected_tables.issubset(Base.metadata.tables)
