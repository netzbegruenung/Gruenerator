"""
Better Auth JWT Authentication Middleware for Presenton FastAPI

Validates Bearer tokens from the Authorization header against the
Better Auth JWKS endpoint (/api/auth/jwks). Extracts user info from
the JWT payload.

Environment variables:
  BETTER_AUTH_URL  - Grünerator API URL, e.g. https://gruenerator.eu
                     (the Better Auth JWKS is at {BETTER_AUTH_URL}/api/auth/jwks)

Public routes (no auth required):
  /health, /docs, /openapi.json, /static/*, /app_data/*
"""

import os
import time
from typing import Optional

import httpx
from fastapi import Request
from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Cache JWKS keys for 1 hour
_jwks_cache: dict = {}
_jwks_cache_time: float = 0
JWKS_CACHE_TTL = 3600


def _get_auth_config():
    auth_url = os.getenv("BETTER_AUTH_URL", "")
    jwks_uri = f"{auth_url}/api/auth/jwks"
    return {
        "issuer": auth_url,
        "audience": auth_url,
        "jwks_uri": jwks_uri,
    }


async def _get_jwks(jwks_uri: str) -> dict:
    global _jwks_cache, _jwks_cache_time

    if _jwks_cache and (time.time() - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_cache

    async with httpx.AsyncClient() as client:
        response = await client.get(jwks_uri, timeout=10)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_time = time.time()
        return _jwks_cache


def _extract_token(request: Request) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


# Routes that don't require authentication
PUBLIC_PATHS = {
    "/health",
    "/docs",
    "/openapi.json",
}

PUBLIC_PREFIXES = [
    "/static/",
    "/app_data/",
]


def _is_public_route(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    for prefix in PUBLIC_PREFIXES:
        if path.startswith(prefix):
            return True
    return False


class BetterAuthMiddleware(BaseHTTPMiddleware):
    """
    Validates JWT tokens issued by Better Auth's JWT plugin.
    Tokens are verified against the JWKS endpoint at /api/auth/jwks.
    """

    async def dispatch(self, request: Request, call_next):
        auth_url = os.getenv("BETTER_AUTH_URL", "")
        if not auth_url:
            # Auth not configured — allow all requests (dev mode)
            return await call_next(request)

        if _is_public_route(request.url.path):
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        token = _extract_token(request)
        if not token:
            return JSONResponse(
                status_code=401,
                content={"error": "Nicht autorisiert — kein Token"},
            )

        config = _get_auth_config()

        try:
            jwks = await _get_jwks(config["jwks_uri"])
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")

            rsa_key = None
            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    rsa_key = key
                    break

            if not rsa_key:
                # Key not found — maybe rotated. Invalidate cache and retry once.
                global _jwks_cache_time
                _jwks_cache_time = 0
                jwks = await _get_jwks(config["jwks_uri"])
                for key in jwks.get("keys", []):
                    if key.get("kid") == kid:
                        rsa_key = key
                        break

            if not rsa_key:
                return JSONResponse(
                    status_code=401,
                    content={"error": "Token-Schlüssel nicht gefunden"},
                )

            # Better Auth JWT plugin uses EdDSA by default
            algorithms = ["EdDSA", "RS256", "ES256"]

            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=algorithms,
                audience=config["audience"],
                issuer=config["issuer"],
            )

            # Attach user info to request state
            request.state.user_id = payload.get("sub")
            request.state.user_email = payload.get("email", "")
            request.state.user_name = payload.get("name", "")

        except JWTError as e:
            return JSONResponse(
                status_code=401,
                content={"error": f"Token ungültig: {str(e)}"},
            )
        except httpx.HTTPError:
            return JSONResponse(
                status_code=503,
                content={"error": "Authentifizierungsserver nicht erreichbar"},
            )

        return await call_next(request)
