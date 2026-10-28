from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Organization


async def ensure_local_organization(session: AsyncSession) -> UUID:
    settings = get_settings()
    organization = await session.get(Organization, settings.local_organization_id)
    if organization is None:
        session.add(
            Organization(
                id=settings.local_organization_id,
                name=settings.local_organization_name,
            )
        )
        await session.flush()
    return settings.local_organization_id