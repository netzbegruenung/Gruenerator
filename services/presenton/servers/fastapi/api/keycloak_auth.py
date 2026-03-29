"""
Keycloak JWT Authentication Middleware for Presenton FastAPI

Validates Bearer tokens from the Authorization header against the
Keycloak JWKS endpoint. Extracts user_id from the 'sub' claim.

Environment variables:
  KEYCLOAK_BASE_URL  - e.g. https://user.netzbegruenung.de
  KEYCLOAK_REALM     - e.g. gruenerator
  KEYCLOAK_CLIENT_ID - e.g. presenton

Public routes (no auth required):
  /health, /docs, /openapi.json, /api/v1/ppt/presentation/generate (POST from internal)
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
JWKS_CACHE_TTL = 3600  # seconds


def _get_keycloak_config():
    base_url = os.getenv("KEYCLOAK_BASE_URL", "")
    realm = os.getenv("KEYCLOAK_REALM", "")
    client_id = os.getenv("KEYCLOAK_CLIENT_ID", "")
    issuer = f"{base_url}/realms/{realm}"
    jwks_uri = f"{issuer}/protocol/openid-connect/certs"
    return {
        "issuer": issuer,
        "jwks_uri": jwks_uri,
        "client_id": client_id,
    }


async def _get_jwks(jwks_uri: str) -> dict:
    global _jwks_cache, _jwks_cache_time

    if _jwks_cache and (time.time() - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_cache

    async with httpx.AsyncClient() as client:
        response = await client.get(jwks_uri)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_time = time.time()
        return _jwks_cache


def _extract_token(request: Request) -> Optional[str]:
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    # Also check cookies (NextAuth session token)
    return request.cookies.get("next-auth.session-token")


# Routes that don't require authentication
PUBLIC_PATHS = {
    "/health",
    "/docs",
    "/openapi.json",
    "/api/v1/ppt/icons/search",
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


class KeycloakAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip auth if Keycloak is not configured
        keycloak_base = os.getenv("KEYCLOAK_BASE_URL", "")
        if not keycloak_base:
            return await call_next(request)

        # Skip public routes
        if _is_public_route(request.url.path):
            return await call_next(request)

        # Skip OPTIONS (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)

        token = _extract_token(request)
        if not token:
            return JSONResponse(
                status_code=401,
                content={"error": "Nicht autorisiert — kein Token"},
            )

        config = _get_keycloak_config()

        try:
            jwks = await _get_jwks(config["jwks_uri"])
            # Decode header to find the right key
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")

            rsa_key = None
            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    rsa_key = key
                    break

            if not rsa_key:
                return JSONResponse(
                    status_code=401,
                    content={"error": "Token-Schlüssel nicht gefunden"},
                )

            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=["RS256"],
                audience=config["client_id"],
                issuer=config["issuer"],
            )

            # Attach user info to request state
            request.state.user_id = payload.get("sub")
            request.state.user_email = payload.get("email", "")
            request.state.user_name = payload.get("preferred_username", "")
            request.state.user_display_name = payload.get("name", "")

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
