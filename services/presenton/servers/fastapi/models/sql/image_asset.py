from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import JSON, Column, DateTime
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime


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
        Non-Electron backend helper for parity with the Electron ImageAsset model.
        For now this simply returns the stored path, allowing frontends to use
        `image.file_url or image.path` without breaking development workflows.
        """
        return self.path
