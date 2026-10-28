from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.llm.client import (
    LLMInputLimitError,
    LLMJobBudget,
    LLMTokenUsage,
    OpenAILLM,
    create_llm_client,
)
from app.llm.schemas import ProductCandidateDecision, ProductColumnMapping


class FakeResponses:
    def __init__(self, response) -> None:
        self.response = response
        self.request = None

    async def parse(self, **kwargs):
        self.request = kwargs
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class FakeLLMClient:
    def __init__(self, response) -> None:
        self.responses = FakeResponses(response)
        self.closed = False

    async def close(self) -> None:
        self.closed = True


def make_response(parsed):
    return SimpleNamespace(
        output_parsed=parsed,
        usage=SimpleNamespace(input_tokens=90, output_tokens=24),
    )


def test_column_mapping_requires_sku_or_description_and_unique_columns() -> None:
    assert ProductColumnMapping(sku=0, description=1).sku == 0
    with pytest.raises(ValidationError):
        ProductColumnMapping(sku=None, description=None)
    with pytest.raises(ValidationError):
        ProductColumnMapping(sku=0, description=0)


@pytest.mark.asyncio
async def test_candidate_resolution_uses_strict_schema_and_rejects_unknown_id() -> None:
    fake_client = FakeLLMClient(
        make_response(
            ProductCandidateDecision(
                decision="MATCH",
                selected_candidate_id="invented-id",
                reason_codes=["DESCRIPTION_MATCH"],
                missing_attributes=[],
            )
        )
    )
    llm = OpenAILLM(
        api_key="test-key",
        model="gpt-4.1-mini",
        job_budget=LLMJobBudget(30_000),
        client=fake_client,
    )

    decision, usage = await llm.resolve_product_candidate(
        description="Kabl PP-Y 3x2.5",
        requested_sku=None,
        requested_unit="m",
        candidates=[{"id": "c0", "sku": "CAB-1", "name": "Kabl PP-Y 3x2.5", "unit": "m"}],
    )

    assert decision is None
    assert usage == LLMTokenUsage(input_tokens=90, output_tokens=24)
    assert fake_client.responses.request["store"] is False
    assert fake_client.responses.request["max_output_tokens"] == 200
    assert fake_client.responses.request["text_format"] is ProductCandidateDecision
    assert llm.job_budget.input_tokens == 90
    assert llm.job_budget.output_tokens == 24


@pytest.mark.asyncio
async def test_candidate_limit_and_job_token_budget_are_enforced() -> None:
    llm = OpenAILLM(
        api_key="test-key",
        model="gpt-4.1-mini",
        job_budget=LLMJobBudget(10),
        client=FakeLLMClient(make_response(None)),
    )
    candidates = [
        {"id": f"c{index}", "sku": f"S-{index}", "name": "Item", "unit": "m"}
        for index in range(6)
    ]

    with pytest.raises(ValueError, match="At most 5"):
        await llm.resolve_product_candidate(
            description="Item",
            requested_sku=None,
            requested_unit="m",
            candidates=candidates,
        )
    with pytest.raises(
        LLMInputLimitError,
        match="LLM_INPUT_LIMIT_EXCEEDED|LLM_JOB_BUDGET_EXCEEDED",
    ):
        await llm.resolve_product_candidate(
            description="Item",
            requested_sku=None,
            requested_unit="m",
            candidates=candidates[:1],
        )


@pytest.mark.asyncio
async def test_failed_provider_request_consumes_reserved_job_budget() -> None:
    budget = LLMJobBudget(30_000)
    llm = OpenAILLM(
        api_key="test-key",
        model="gpt-4.1-mini",
        job_budget=budget,
        client=FakeLLMClient(ValueError("invalid structured response")),
    )

    result, usage = await llm.suggest_column_mapping(
        headers=["Artikelcode", "Beschreibung"],
        sample_rows=[["X-1", "Test item"]],
    )

    assert result is None
    assert usage.input_tokens > 0
    assert usage.output_tokens == 1_200
    assert budget.input_tokens == usage.input_tokens
    assert budget.output_tokens == usage.output_tokens
    assert budget._reserved_tokens == 0


def test_provider_is_disabled_without_api_key() -> None:
    settings = Settings(_env_file=None, openai_api_key=None)
    assert create_llm_client(settings) is None