from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.workspace import ensure_local_organization
from app.models import (
    CatalogImport,
    Product,
    ProductAlias,
)
from app.schemas.catalog import (
    CatalogImportListItem,
    CatalogImportResponse,
    CatalogProductInput,
    CatalogProductRead,
)


async def persist_catalog_import(
    session: AsyncSession,
    *,
    checksum: str,
    sheet_name: str | None,
    original_filename: str,
    products: list[CatalogProductInput],
    aliases_imported: int,
) -> CatalogImportResponse:
    organization_id = get_settings().local_organization_id

    async with session.begin():
        await ensure_local_organization(session)
        current_version = await session.scalar(
            select(func.max(CatalogImport.version)).where(
                CatalogImport.organization_id == organization_id
            )
        )
        version = (current_version or 0) + 1
        catalog_import = CatalogImport(
            organization_id=organization_id,
            version=version,
            checksum=checksum,
            status="IMPORTED",
        )
        session.add(catalog_import)
        await session.flush()

        imported_products = [
            Product(
                organization_id=organization_id,
                catalog_import_id=catalog_import.id,
                sku=item.sku,
                name=item.name,
                unit=item.unit,
                price=item.price,
                currency=item.currency,
                vat_rate=item.vat_rate,
                active=item.active,
            )
            for item in products
        ]
        session.add_all(imported_products)
        await session.flush()

        aliases = [
            ProductAlias(
                organization_id=organization_id,
                product_id=product.id,
                alias=alias,
            )
            for product, item in zip(imported_products, products, strict=True)
            for alias in item.aliases
        ]
        session.add_all(aliases)
        await session.flush()

        response = CatalogImportResponse(
            id=catalog_import.id,
            version=version,
            status=catalog_import.status,
            original_filename=original_filename,
            sheet_name=sheet_name,
            checksum=checksum,
            products_imported=len(imported_products),
            aliases_imported=len(aliases),
            created_at=catalog_import.created_at,
        )

    return response


async def list_catalog_imports(session: AsyncSession) -> list[CatalogImportListItem]:
    organization_id = get_settings().local_organization_id
    product_count = (
        select(func.count(Product.id))
        .where(Product.catalog_import_id == CatalogImport.id)
        .correlate(CatalogImport)
        .scalar_subquery()
    )
    alias_count = (
        select(func.count(ProductAlias.id))
        .join(Product, Product.id == ProductAlias.product_id)
        .where(Product.catalog_import_id == CatalogImport.id)
        .correlate(CatalogImport)
        .scalar_subquery()
    )
    result = await session.execute(
        select(CatalogImport, product_count, alias_count)
        .where(CatalogImport.organization_id == organization_id)
        .order_by(CatalogImport.version.desc())
    )
    return [
        CatalogImportListItem(
            id=catalog_import.id,
            version=catalog_import.version,
            status=catalog_import.status,
            checksum=catalog_import.checksum,
            products_imported=products_imported,
            aliases_imported=aliases_imported,
            created_at=catalog_import.created_at,
        )
        for catalog_import, products_imported, aliases_imported in result.all()
    ]


async def list_catalog_products(
    session: AsyncSession,
    *,
    catalog_import_id: UUID | None,
    query: str | None,
) -> list[CatalogProductRead]:
    organization_id = get_settings().local_organization_id
    if catalog_import_id is None:
        catalog_import_id = await session.scalar(
            select(CatalogImport.id)
            .where(CatalogImport.organization_id == organization_id)
            .order_by(CatalogImport.version.desc())
            .limit(1)
        )
    if catalog_import_id is None:
        return []

    statement = select(Product).where(
        Product.organization_id == organization_id,
        Product.catalog_import_id == catalog_import_id,
    )
    if query:
        search = f"%{query.strip()}%"
        statement = statement.where(Product.name.ilike(search) | Product.sku.ilike(search))
    statement = statement.order_by(Product.sku).limit(3000)

    products = (await session.scalars(statement)).all()
    output: list[CatalogProductRead] = []
    for product in products:
        aliases = await session.scalars(
            select(ProductAlias.alias)
            .where(
                ProductAlias.organization_id == organization_id,
                ProductAlias.product_id == product.id,
            )
            .order_by(ProductAlias.alias)
        )
        output.append(
            CatalogProductRead(
                id=product.id,
                sku=product.sku,
                name=product.name,
                unit=product.unit,
                price=product.price,
                currency=product.currency,
                vat_rate=product.vat_rate,
                aliases=list(aliases.all()),
            )
        )
    return output