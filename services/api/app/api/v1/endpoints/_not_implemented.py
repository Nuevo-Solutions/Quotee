from typing import NoReturn

from fastapi import HTTPException, status


def not_implemented(feature: str) -> NoReturn:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"{feature} is scaffolded but not implemented yet.",
    )