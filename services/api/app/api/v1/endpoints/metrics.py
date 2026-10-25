from fastapi import APIRouter

from app.api.v1.endpoints._not_implemented import not_implemented
from app.core.enums import WorkflowType

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/pilot", status_code=501)
async def get_pilot_metrics(workflow: WorkflowType | None = None) -> None:
    not_implemented("Pilot metrics")
