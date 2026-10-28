import json
from types import SimpleNamespace
from uuid import UUID

import httpx
import pytest

from app import models  # noqa: F401
from app.core.enums import AvailabilityStatus, ProcessingStatus, ReviewStatus
from app.documents import storage
from app.documents.product_parser import (
    ProductColumnMappingRequiredError,
    parse_product_document,
)
from app.jobs import processor
from app.llm.client import LLMTokenUsage
from app.llm.schemas import ProductCandidateDecision, ProductColumnMapping
from app.main import app
from app.models import ProcessingJob


def test_processing_job_timestamps_are_timezone_aware() -> None:
    assert ProcessingJob.__table__.c.started_at.type.timezone is True
    assert ProcessingJob.__table__.c.finished_at.type.timezone is True


def test_column_mapping_allows_selection_through_tenth_column() -> None:
    document_id = UUID("00000000-0000-4000-8000-000000000123")
    file_bytes = (
        b"Intro,Section,Notes\n"
        b",,context,,,wire,m,SKU-10,Test product,5\n"
    )

    with pytest.raises(ProductColumnMappingRequiredError) as error:
        parse_product_document(
            document_id=document_id,
            filename="request.csv",
            file_bytes=file_bytes,
        )

    assert len(error.value.headers) == 10
    assert error.value.headers[:3] == ["Intro", "Section", "Notes"]
    assert error.value.headers[9] == ""

    lines, _ = parse_product_document(
        document_id=document_id,
        filename="request.csv",
        file_bytes=file_bytes,
        column_mapping={"sku": 7, "description": 8, "quantity": 9, "unit": 6},
    )

    assert lines[0].source_sku == "SKU-10"
    assert lines[0].raw_description == "Test product"
    assert str(lines[0].quantity) == "5"
    assert lines[0].unit == "m"


@pytest.mark.asyncio
async def test_product_processing_persists_reviewable_results(
    tmp_path,
    monkeypatch,
    test_db,
) -> None:
    document_storage_path = tmp_path / "documents"
    monkeypatch.setattr(storage, "get_storage_directory", lambda: document_storage_path)
    monkeypatch.setattr(
        processor,
        "get_settings",
        lambda: SimpleNamespace(
            local_organization_id=UUID("00000000-0000-4000-8000-000000000001"),
            document_storage_path=document_storage_path,
            llm_job_max_tokens=30_000,
        ),
    )

    class FakeLLM:
        def __init__(self) -> None:
            self.job_budget = SimpleNamespace(input_tokens=0, output_tokens=0)
            self.match_calls = 0

        async def resolve_product_candidate(self, *, candidates, **_kwargs):
            self.match_calls += 1
            self.job_budget.input_tokens += 120
            self.job_budget.output_tokens += 30
            return (
                ProductCandidateDecision(
                    decision="MATCH",
                    selected_candidate_id=candidates[0]["id"],
                    reason_codes=["DESCRIPTION_MATCH", "UNIT_MATCH"],
                    missing_attributes=[],
                ),
                LLMTokenUsage(input_tokens=120, output_tokens=30),
            )

        async def close(self):
            return None

    fake_llm = FakeLLM()

    def create_fake_llm(_settings, *, job_budget):
        fake_llm.job_budget = job_budget
        return fake_llm

    monkeypatch.setattr(processor, "create_llm_client", create_fake_llm)

    catalog_csv = (
        b"SKU,Proizvod,JM,Cena,Valuta,PDV,Alternativni naziv\n"
        b"A-1,Blue Cable 3x2.5,m,12.50,RSD,20,Wire\n"
        b"A-2,Blue Cable,m,10.00,RSD,20,\n"
    )
    document_csv = (
        b"Position,SKU,Description,Quantity,Unit\n"
        b"1,A-1,Blue Cable 3x2.5,2,m\n"
        b"2,A-1,Blue Cable 3x2.5,1,kom\n"
        b"3,A-1,Blue Cable 3x2.5,,m\n"
        b"4,,Blue Cable 5x1.5,2,m\n"
        b"5,,Wire,3,m\n"
        b"6,,,2,m\n"
        b"7,A-2,Blue Cable 3x2.5,2,m\n"
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        catalog = await client.post(
            "/api/v1/catalog/imports",
            data={
                "mapping": json.dumps(
                    {
                        "sku": 0,
                        "name": 1,
                        "unit": 2,
                        "price": 3,
                        "currency": 4,
                        "vat_rate": 5,
                        "aliases": 6,
                    }
                )
            },
            files={"file": ("catalog.csv", catalog_csv, "text/csv")},
        )
        upload = await client.post(
            "/api/v1/documents",
            data={"document_type": "PRODUCT_LIST", "workflow": "PRODUCT_QUOTE"},
            files={"file": ("inquiry.csv", document_csv, "text/csv")},
        )
        document_id = upload.json()["id"]
        enqueue = await client.post(f"/api/v1/documents/{document_id}/process")

    assert catalog.status_code == 201
    assert upload.status_code == 201
    assert enqueue.status_code == 202
    job = enqueue.json()
    assert job["status"] == ProcessingStatus.UPLOADED.value
    assert job["catalog_import_id"] == catalog.json()["id"]

    processed = await processor.process_next_job(test_db, UUID(job["id"]))
    assert processed is True

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        job_response = await client.get(f"/api/v1/jobs/{job['id']}")
        positions_response = await client.get(
            f"/api/v1/documents/{document_id}/positions",
            params={"job_id": job["id"]},
        )
        latest_job_response = await client.get(
            f"/api/v1/documents/{document_id}/jobs/latest"
        )
        retry_response = await client.post(f"/api/v1/documents/{document_id}/process")

    assert job_response.status_code == 200
    assert job_response.json()["status"] == ProcessingStatus.NEEDS_REVIEW.value
    assert job_response.json()["result_count"] == 7
    assert latest_job_response.json()["id"] == job["id"]
    assert retry_response.json()["id"] == job["id"]

    results = positions_response.json()
    assert positions_response.status_code == 200
    assert len(results) == 7
    assert results[0]["review_status"] == ReviewStatus.EXACT_MATCH.value
    assert results[0]["selected_product_id"] == results[0]["candidates"][0]["product_id"]
    assert results[0]["availability_status"] == AvailabilityStatus.UNKNOWN.value
    assert results[0]["source_ref"]["row"] == 2
    assert results[1]["review_status"] == ReviewStatus.AMBIGUOUS.value
    assert "UNIT_MISMATCH" in results[1]["reason_codes"]
    assert results[2]["review_status"] == ReviewStatus.INVALID_INPUT.value
    assert results[2]["reason_codes"] == ["MISSING_QUANTITY"]
    assert results[2]["source_ref"]["row"] == 4
    assert results[3]["review_status"] == ReviewStatus.AMBIGUOUS.value
    assert "SPECIFICATION_CONFLICT" in results[3]["reason_codes"]
    assert results[3]["selected_product_id"] is None
    assert results[4]["review_status"] == ReviewStatus.SUGGESTED_MATCH.value
    assert results[4]["confidence"] == "MEDIUM"
    assert "HUMAN_CONFIRMATION_REQUIRED" in results[4]["reason_codes"]
    assert "LLM_MATCH_SUGGESTION" in results[4]["reason_codes"]
    assert results[5]["review_status"] == ReviewStatus.INVALID_INPUT.value
    assert results[5]["reason_codes"] == ["MISSING_DESCRIPTION"]
    assert results[5]["source_ref"]["row"] == 7
    assert results[6]["review_status"] == ReviewStatus.AMBIGUOUS.value
    assert "SPECIFICATION_UNKNOWN" in results[6]["reason_codes"]
    assert results[6]["selected_product_id"] is None
    assert fake_llm.match_calls == 1
    assert job_response.json()["llm_input_tokens"] == 120
    assert job_response.json()["llm_output_tokens"] == 30


@pytest.mark.asyncio
async def test_llm_column_mapping_waits_for_confirmation_then_resumes_job(
    tmp_path,
    monkeypatch,
    test_db,
) -> None:
    document_storage_path = tmp_path / "documents"
    monkeypatch.setattr(storage, "get_storage_directory", lambda: document_storage_path)
    monkeypatch.setattr(
        processor,
        "get_settings",
        lambda: SimpleNamespace(
            local_organization_id=UUID("00000000-0000-4000-8000-000000000001"),
            document_storage_path=document_storage_path,
            llm_job_max_tokens=30_000,
        ),
    )

    class FakeLLM:
        def __init__(self) -> None:
            self.job_budget = SimpleNamespace(input_tokens=0, output_tokens=0)
            self.received_headers = None
            self.received_rows = None

        async def suggest_column_mapping(self, *, headers, sample_rows):
            self.received_headers = headers
            self.received_rows = sample_rows
            self.job_budget.input_tokens += 80
            self.job_budget.output_tokens += 20
            return (
                ProductColumnMapping(position=None, sku=0, description=1, quantity=2, unit=3),
                LLMTokenUsage(input_tokens=80, output_tokens=20),
            )

        async def resolve_product_candidate(self, **_kwargs):
            raise AssertionError("Exact SKU must not call the LLM.")

        async def close(self):
            return None

    fake_llm = FakeLLM()

    def create_fake_llm(_settings, *, job_budget):
        fake_llm.job_budget = job_budget
        return fake_llm

    monkeypatch.setattr(processor, "create_llm_client", create_fake_llm)
    catalog_csv = b"SKU,Proizvod,JM,Cena,Valuta,PDV,Alias\nA-1,Blue Cable,m,12,RSD,20,\n"
    inquiry_csv = b"Artikelcode,Bezeichnung,Menge,Einheit\nA-1,Blue Cable,3,m\n"

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        catalog = await client.post(
            "/api/v1/catalog/imports",
            data={
                "mapping": json.dumps(
                    {
                        "sku": 0,
                        "name": 1,
                        "unit": 2,
                        "price": 3,
                        "currency": 4,
                        "vat_rate": 5,
                        "aliases": 6,
                    }
                )
            },
            files={"file": ("catalog.csv", catalog_csv, "text/csv")},
        )
        upload = await client.post(
            "/api/v1/documents",
            data={"document_type": "INQUIRY", "workflow": "PRODUCT_QUOTE"},
            files={"file": ("request.csv", inquiry_csv, "text/csv")},
        )
        document_id = upload.json()["id"]
        enqueue = await client.post(f"/api/v1/documents/{document_id}/process")

    assert catalog.status_code == 201
    assert upload.status_code == 201
    job_id = enqueue.json()["id"]
    await processor.process_next_job(test_db, UUID(job_id))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        waiting_job = await client.get(f"/api/v1/jobs/{job_id}")
        confirm = await client.post(
            f"/api/v1/documents/{document_id}/jobs/{job_id}/mapping",
            json={"position": None, "sku": 0, "description": 1, "quantity": 2, "unit": 3},
        )

    assert fake_llm.received_headers[:4] == [
        "Artikelcode",
        "Bezeichnung",
        "Menge",
        "Einheit",
    ]
    assert len(fake_llm.received_headers) == 10
    assert fake_llm.received_headers[4:] == [""] * 6
    assert fake_llm.received_rows == [["A-1", "Blue Cable", "3", "m"]]
    assert waiting_job.json()["status"] == ProcessingStatus.MAPPING_REQUIRED.value
    assert waiting_job.json()["mapping_suggestion"]["sku"] == 0
    assert waiting_job.json()["llm_input_tokens"] == 80
    assert waiting_job.json()["llm_output_tokens"] == 20
    assert confirm.status_code == 202
    assert confirm.json()["id"] == job_id
    assert confirm.json()["status"] == ProcessingStatus.UPLOADED.value

    await processor.process_next_job(test_db, UUID(job_id))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        completed_job = await client.get(f"/api/v1/jobs/{job_id}")
        results = await client.get(
            f"/api/v1/documents/{document_id}/positions", params={"job_id": job_id}
        )

    assert completed_job.json()["status"] == ProcessingStatus.NEEDS_REVIEW.value
    assert completed_job.json()["result_count"] == 1
    assert results.json()[0]["review_status"] == ReviewStatus.EXACT_MATCH.value
    assert fake_llm.received_headers[:4] == [
        "Artikelcode",
        "Bezeichnung",
        "Menge",
        "Einheit",
    ]
