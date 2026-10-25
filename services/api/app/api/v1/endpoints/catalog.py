from fastapi import APIRouter

from app.api.v1.endpoints._not_implemented import not_implemented

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.post("/imports", status_code=501)
async def create_catalog_import() -> None:
    not_implemented("Catalog import")


@router.get("/products", status_code=501)
async def list_products() -> None:
    not_implemented("Product catalog")
