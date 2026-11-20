from fastapi import HTTPException, Security
from fastapi.security.api_key import APIKeyHeader
from app.core.config import settings

api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=True)


async def require_api_key(api_key: str | None = Security(api_key_scheme)) -> None:
    if not settings.API_KEY:
        return
    if api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing API key")
