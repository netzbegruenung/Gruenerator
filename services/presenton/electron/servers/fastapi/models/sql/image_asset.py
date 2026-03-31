from datetime import datetime
from typing import Optional
import os
import uuid

from sqlalchemy import JSON, Column, DateTime
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime
from utils.get_env import get_app_data_directory_env
from utils.path_helpers import get_resource_path


class ImageAsset(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, default=get_current_utc_datetime
        ),
    )
    is_uploaded: bool = Field(default=False)
    path: str
    extras: Optional[dict] = Field(sa_column=Column(JSON), default=None)
    
    @property
    def file_url(self) -> str:
        """
        Returns a web path suitable for FastAPI static serving.
        - HTTP(S) URLs are returned as-is.
        - Files under APP_DATA are exposed under /app_data.
        - Files under the packaged static directory are exposed under /static.
        """
        path = self.path

        # Already an absolute web URL
        if path.startswith("http://") or path.startswith("https://"):
            return path

        # Normalize filesystem path
        real_path = os.path.realpath(path)

        # Map APP_DATA files to /app_data/...
        app_data_dir = get_app_data_directory_env()
        if app_data_dir:
            app_data_dir_real = os.path.realpath(app_data_dir)
            if real_path.startswith(app_data_dir_real):
                rel = os.path.relpath(real_path, app_data_dir_real)
                rel_web = rel.replace(os.sep, "/")
                return f"/app_data/{rel_web}"

        # Map packaged static assets to /static/...
        static_root = get_resource_path("static")
        static_root_real = os.path.realpath(static_root)
        if real_path.startswith(static_root_real):
            rel = os.path.relpath(real_path, static_root_real)
            rel_web = rel.replace(os.sep, "/")
            return f"/static/{rel_web}"

        # Fallback: return the original path (may be absolute or relative);
        # frontend can decide how to handle unusual cases.
        return path
