from __future__ import annotations

from fastapi import APIRouter

from app.api.routes.legacy import router as legacy_router


api_router = APIRouter()
api_router.include_router(legacy_router)
