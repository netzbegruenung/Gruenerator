"""
Better Auth Session Validation Middleware for Presenton FastAPI

Validates Bearer session tokens from the Authorization header by
looking them up in the shared ba_sessions table in PostgreSQL.
Both Grünerator and Presenton share the same database.

Environment variables:
  DATABASE_URL  - PostgreSQL connection string (shared with Grünerator)

The bearer token is the Better Auth session token, passed via:
  Authorization: Bearer <session-token>

Public routes (no auth required):
  /health, /docs, /openapi.json, /static/*, /app_data/*
"""

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Lazy-initialized connection
_db_pool = None


async def _get_pool():
    """Get or create async connection pool for session lookups."""
    global _db_pool
    if _db_pool is not None:
        return _db_pool

    try:
        import asyncpg

        db_url = os.getenv("DATABASE_URL", "")
        # asyncpg uses postgresql:// not postgresql+asyncpg://
        clean_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
        _db_pool = await asyncpg.create_pool(clean_url, min_size=1, max_size=3)
        return _db_pool
    except Exception as e:
        print(f"[BetterAuth] Failed to create DB pool: {e}")
        return None


def _extract_token(request: Request) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]

    # Also check Better Auth cookie (ba.session_token)
    cookie_prefix = os.getenv("BA_COOKIE_PREFIX", "ba")
    return request.cookies.get(f"{cookie_prefix}.session_token")


PUBLIC_PATHS = {"/health", "/docs", "/openapi.json"}
PUBLIC_PREFIXES = ["/static/", "/app_data/"]


def _is_public_route(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    return any(path.startswith(p) for p in PUBLIC_PREFIXES)


class BetterAuthMiddleware(BaseHTTPMiddleware):
    """
    Validates Better Auth session tokens by querying the shared
    ba_sessions table in PostgreSQL. Extracts user info from the
    linked profiles table.
    """

    async def dispatch(self, request: Request, call_next):
        db_url = os.getenv("DATABASE_URL", "")
        if not db_url:
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

        pool = await _get_pool()
        if not pool:
            return JSONResponse(
                status_code=503,
                content={"error": "Datenbankverbindung nicht verfügbar"},
            )

        try:
            row = await pool.fetchrow(
                """
                SELECT s.user_id, s.expires_at,
                       p.display_name, p.email
                FROM ba_sessions s
                JOIN profiles p ON p.id = s.user_id
                WHERE s.token = $1
                """,
                token,
            )

            if not row:
                return JSONResponse(
                    status_code=401,
                    content={"error": "Sitzung ungültig oder abgelaufen"},
                )

            expires_at = row["expires_at"]
            if expires_at and expires_at < datetime.now(timezone.utc):
                return JSONResponse(
                    status_code=401,
                    content={"error": "Sitzung abgelaufen"},
                )

            request.state.user_id = str(row["user_id"])
            request.state.user_email = row["email"] or ""
            request.state.user_name = row["display_name"] or ""

        except Exception as e:
            print(f"[BetterAuth] Session validation error: {e}")
            return JSONResponse(
                status_code=500,
                content={"error": "Authentifizierungsfehler"},
            )

        return await call_next(request)
