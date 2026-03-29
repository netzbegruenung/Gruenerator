import os
import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.sql.key_value import KeyValueSqlModel
from services.database import get_async_session
from utils.get_env import get_app_data_directory_env

try:
    from fontTools.ttLib import TTFont

    FONTTOOLS_AVAILABLE = True
except ImportError:
    FONTTOOLS_AVAILABLE = False

FONTS_ROUTER = APIRouter(prefix="/fonts", tags=["fonts"])
FONTS_STORAGE_KEY = "presentation_uploaded_fonts"

SUPPORTED_FONT_EXTENSIONS = {
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".eot": "application/vnd.ms-fontobject",
}


class FontDetail(BaseModel):
    id: str
    name: str
    url: str


class FontUploadResponse(FontDetail):
    success: bool = True
    font_name: str
    font_url: str
    font_path: str


class FontListResponse(BaseModel):
    fonts: List[FontDetail]


def _get_fonts_directory() -> str:
    app_data_dir = get_app_data_directory_env() or "/tmp/presenton"
    fonts_dir = os.path.join(app_data_dir, "fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    return fonts_dir


def _extract_font_name_from_file(file_path: str, filename: str) -> str:
    fallback_name = os.path.splitext(filename)[0]

    if not FONTTOOLS_AVAILABLE:
        return fallback_name

    try:
        font = TTFont(file_path)
        if "name" not in font:
            font.close()
            return fallback_name

        name_table = font["name"]
        for name_id in [1, 4, 6]:
            for record in name_table.names:
                if record.nameID == name_id:
                    if record.langID in [0x409, 0]:
                        font_name = record.toUnicode().strip()
                        if font_name:
                            font.close()
                            return font_name

        for record in name_table.names:
            if record.nameID == 1:
                font_name = record.toUnicode().strip()
                if font_name:
                    font.close()
                    return font_name

        font.close()
    except Exception:
        return fallback_name

    return fallback_name


def _is_valid_font_file(file: UploadFile) -> bool:
    if not file.filename:
        return False

    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in SUPPORTED_FONT_EXTENSIONS:
        return False

    content_type = (file.content_type or "").lower()
    valid_mime_types = {
        "font/ttf",
        "font/otf",
        "font/woff",
        "font/woff2",
        "application/font-ttf",
        "application/font-otf",
        "application/font-woff",
        "application/font-woff2",
        "application/x-font-ttf",
        "application/x-font-otf",
        "font/truetype",
        "font/opentype",
        "application/octet-stream",
        "",
    }

    return content_type in valid_mime_types


async def _get_fonts_row(sql_session: AsyncSession) -> Optional[KeyValueSqlModel]:
    return await sql_session.scalar(
        select(KeyValueSqlModel).where(KeyValueSqlModel.key == FONTS_STORAGE_KEY)
    )


def _read_fonts_from_row(row: Optional[KeyValueSqlModel]) -> list[dict[str, Any]]:
    if not row:
        return []
    value = row.value if isinstance(row.value, dict) else {}
    fonts = value.get("fonts", [])
    return fonts if isinstance(fonts, list) else []


@FONTS_ROUTER.post("/upload", response_model=FontUploadResponse)
async def upload_font(
    file: Optional[UploadFile] = File(
        None, description="Font file to upload (.ttf, .otf, .woff, .woff2, .eot)"
    ),
    font_file: Optional[UploadFile] = File(None),
    sql_session: AsyncSession = Depends(get_async_session),
):
    upload_file = file or font_file
    if not upload_file:
        raise HTTPException(status_code=400, detail="No file provided")

    if not upload_file.filename:
        raise HTTPException(status_code=400, detail="No file name provided")

    if not _is_valid_font_file(upload_file):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid font file. Supported formats: {', '.join(SUPPORTED_FONT_EXTENSIONS.keys())}",
        )

    file_ext = os.path.splitext(upload_file.filename)[1].lower()
    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
    fonts_dir = _get_fonts_directory()
    font_path = os.path.join(fonts_dir, unique_filename)

    try:
        contents = await upload_file.read()
        with open(font_path, "wb") as buffer:
            buffer.write(contents)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Error uploading font") from exc

    font_name = _extract_font_name_from_file(font_path, upload_file.filename)
    font_url = f"/app_data/fonts/{unique_filename}"
    font_detail = {
        "id": str(uuid.uuid4()),
        "name": font_name,
        "url": font_url,
        "path": font_path,
    }

    row = await _get_fonts_row(sql_session)
    fonts = _read_fonts_from_row(row)
    fonts.append(font_detail)

    if row:
        row.value = {"fonts": fonts}
        sql_session.add(row)
    else:
        sql_session.add(KeyValueSqlModel(key=FONTS_STORAGE_KEY, value={"fonts": fonts}))
    await sql_session.commit()

    return FontUploadResponse(
        id=font_detail["id"],
        name=font_detail["name"],
        url=font_detail["url"],
        font_name=font_detail["name"],
        font_url=font_detail["url"],
        font_path=font_detail["path"],
    )


@FONTS_ROUTER.get("/uploaded", response_model=FontListResponse)
async def get_uploaded_fonts(sql_session: AsyncSession = Depends(get_async_session)):
    row = await _get_fonts_row(sql_session)
    fonts = _read_fonts_from_row(row)

    valid_fonts = []
    for font in fonts:
        path = font.get("path")
        if isinstance(path, str) and os.path.exists(path):
            valid_fonts.append(font)

    if row and len(valid_fonts) != len(fonts):
        row.value = {"fonts": valid_fonts}
        sql_session.add(row)
        await sql_session.commit()

    return FontListResponse(
        fonts=[
            FontDetail(
                id=str(item.get("id", "")),
                name=str(item.get("name", "")),
                url=str(item.get("url", "")),
            )
            for item in valid_fonts
        ]
    )


@FONTS_ROUTER.delete("/{font_id}", status_code=204)
async def delete_uploaded_font(
    font_id: str, sql_session: AsyncSession = Depends(get_async_session)
):
    row = await _get_fonts_row(sql_session)
    if not row:
        raise HTTPException(status_code=404, detail="Font not found")

    fonts = _read_fonts_from_row(row)
    target_font = next((item for item in fonts if str(item.get("id")) == font_id), None)
    if not target_font:
        raise HTTPException(status_code=404, detail="Font not found")

    path = target_font.get("path")
    if isinstance(path, str) and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            # Keep metadata cleanup resilient even if local file is already gone/locked.
            pass

    updated_fonts = [item for item in fonts if str(item.get("id")) != font_id]
    row.value = {"fonts": updated_fonts}
    sql_session.add(row)
    await sql_session.commit()