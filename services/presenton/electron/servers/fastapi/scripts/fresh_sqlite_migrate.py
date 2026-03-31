#!/usr/bin/env python3
"""
Delete local SQLite database files and run migrations programmatically (same as app startup).

Use this when alembic_version points at a removed revision or you want a clean DB.

From electron/servers/fastapi:

  uv run python scripts/fresh_sqlite_migrate.py

Optional — match Electron dev layout (default if unset):

  APP_DATA_DIRECTORY=/abs/path/to/electron/app_data uv run python scripts/fresh_sqlite_migrate.py

Then create migrations from models (DB is at init only):

  uv run alembic revision --autogenerate -m "add_theme_to_presentations"
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# servers/fastapi as import root (same as runtime)
_FASTAPI_ROOT = Path(__file__).resolve().parents[1]
if str(_FASTAPI_ROOT) not in sys.path:
    sys.path.insert(0, str(_FASTAPI_ROOT))

os.environ.setdefault(
    "APP_DATA_DIRECTORY",
    str(_FASTAPI_ROOT.parent.parent / "app_data"),
)
os.environ.setdefault("MIGRATE_DATABASE_ON_STARTUP", "True")

from migrations import _to_sync_database_url, run_migrations_sync  # noqa: E402
from utils.db_utils import get_database_url_and_connect_args  # noqa: E402


def _sqlite_file_path(sync_url: str) -> Path | None:
    if not sync_url.startswith("sqlite:///"):
        return None
    raw = sync_url[len("sqlite:///") :]
    if os.name == "nt" and len(raw) >= 3 and raw[0] == "/" and raw[2] == ":":
        raw = raw[1:]
    return Path(raw)


def main() -> None:
    database_url, _ = get_database_url_and_connect_args()
    sync_url = _to_sync_database_url(database_url)
    paths: list[Path] = []

    p = _sqlite_file_path(sync_url)
    if p is not None:
        paths.append(p)
        paths.append(p.parent / "container.db")

    seen: set[Path] = set()
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        if path.is_file():
            print(f"Removing {path}", flush=True)
            path.unlink()

    print("Running Alembic upgrade (programmatic)...", flush=True)
    run_migrations_sync()
    print("Done.", flush=True)


if __name__ == "__main__":
    main()
