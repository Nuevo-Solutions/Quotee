from uuid import UUID

from fastapi import APIRouter

from app.api.v1.endpoints._not_implemented import not_implemented

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", status_code=501)
async def get_job(job_id: UUID) -> None:
    not_implemented("Job status")
