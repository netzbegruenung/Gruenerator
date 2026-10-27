"""NDJSON-Ereignisse eines Laufs.

Die Formen sind der Vertrag mit der API (dort als Zod-Schema gespiegelt):
``step``, ``screenshot_saved``, ``done``, ``error``. Felder nie umbenennen.
"""

import base64
import io
from pathlib import Path

from PIL import Image

from browser_use.filesystem.file_system import FileSystem

_JPEG_WIDTH = 1024
_JPEG_QUALITY = 70
_TEXT_MAX = 160
# Parameter, die bei Nicht-Klick-Aktionen als Ziel taugen, in dieser Reihenfolge.
_TARGET_PARAMS = ("url", "query", "text", "file_name")


def _clip(text: str | None) -> str | None:
    if not text:
        return None
    text = " ".join(str(text).split())
    return text[:_TEXT_MAX] if text else None


def screenshot_to_jpeg_b64(png_b64: str | None) -> str:
    """Base64-PNG aus browser-use → Base64-JPEG, höchstens 1024 px breit. Leer bleibt leer."""
    if not png_b64:
        return ""
    img = Image.open(io.BytesIO(base64.b64decode(png_b64))).convert("RGB")
    if img.width > _JPEG_WIDTH:
        img = img.resize((_JPEG_WIDTH, round(img.height * _JPEG_WIDTH / img.width)), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=_JPEG_QUALITY)
    return base64.b64encode(buf.getvalue()).decode()


def _actions(model_output) -> list[tuple[str, dict]]:
    out = []
    for action in getattr(model_output, "action", None) or []:
        dumped = action.model_dump(exclude_unset=True)
        for name, params in dumped.items():
            if params is not None:
                out.append((name, params if isinstance(params, dict) else {}))
                break
    return out


def _element_label(node) -> str | None:
    ax = getattr(node, "ax_node", None)
    if ax is not None and getattr(ax, "name", None):
        return _clip(ax.name)
    try:
        return _clip(node.get_meaningful_text_for_llm())
    except Exception:
        return None


def _click_pct(state, node) -> tuple[float | None, float | None]:
    """Mittelpunkt des Elements in Prozent des Viewports, sonst (None, None).

    ``absolute_position`` ist eine Dokument-Koordinate (CDP DOMSnapshot), also
    wird die Scroll-Position abgezogen.
    """
    rect = getattr(node, "absolute_position", None)
    info = getattr(state, "page_info", None)
    if rect is None or info is None or not info.viewport_width or not info.viewport_height:
        return None, None
    cx = rect.x + rect.width / 2 - info.scroll_x
    cy = rect.y + rect.height / 2 - info.scroll_y
    x_pct = round(cx / info.viewport_width * 100, 2)
    y_pct = round(cy / info.viewport_height * 100, 2)
    if not (0 <= x_pct <= 100 and 0 <= y_pct <= 100):
        return None, None
    return x_pct, y_pct


def step_event_from(state, model_output, n: int) -> dict:
    actions = _actions(model_output)
    action, params = actions[0] if actions else ("", {})
    target = None
    x_pct = y_pct = None

    click = next(((name, p) for name, p in actions if name == "click"), None)
    if click is not None and click[1].get("index") is not None:
        selector_map = getattr(getattr(state, "dom_state", None), "selector_map", None) or {}
        node = selector_map.get(click[1]["index"])
        if node is not None:
            x_pct, y_pct = _click_pct(state, node)
            if action == "click":
                target = _element_label(node)
    if target is None and action != "click":
        target = next((_clip(params[k]) for k in _TARGET_PARAMS if params.get(k)), None)

    return {
        "type": "step",
        "n": n,
        "url": state.url or "",
        "title": state.title or "",
        "action": action,
        "target": target,
        "x_pct": x_pct,
        "y_pct": y_pct,
        "thought": _clip(getattr(model_output, "next_goal", None) or getattr(model_output, "thinking", None)),
        "screenshot_jpeg_b64": screenshot_to_jpeg_b64(state.screenshot),
    }


def screenshot_saved_event(path: Path) -> dict:
    return {
        "type": "screenshot_saved",
        "file_name": path.name,
        "png_b64": base64.b64encode(path.read_bytes()).decode(),
    }


def done_event(summary: str, agent_says_success: bool | None, saved: list[str], steps: int, seconds: float) -> dict:
    return {
        "type": "done",
        "summary": summary,
        "agent_says_success": agent_says_success,
        "saved": saved,
        "steps": steps,
        "seconds": round(seconds, 1),
    }


def error_event(message: str) -> dict:
    return {"type": "error", "message": message}


def unique_png_name(name: str, existing: set[str]) -> str:
    """``a.png`` → ``a (1).png`` usw., bis der Name frei ist.

    Auch die von browser-use bereinigte Form (``a-(1).png``) zählt als belegt,
    denn so landet der Name am Ende auf der Platte.
    """
    stem = name[:-4] if name.lower().endswith(".png") else name
    candidate = name
    i = 0
    while candidate in existing or FileSystem.sanitize_filename(candidate) in existing:
        i += 1
        candidate = f"{stem} ({i}).png"
    return candidate
