from fastapi import APIRouter

from app.api.v1.endpoints import catalog, documents, health, jobs, metrics, quotes

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(catalog.router)
api_router.include_router(documents.router)
api_router.include_router(jobs.router)
api_router.include_router(quotes.router)
api_router.include_router(metrics.router)
