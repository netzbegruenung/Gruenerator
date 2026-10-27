"""Ein Lauf: browser-use konfigurieren, Schritte als Ereignisse liefern, Dateien zählen."""

import asyncio
import logging
import shutil
import tempfile
import time
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import anyio
from browser_use import Agent, BrowserProfile, BrowserSession, Tools
from browser_use.filesystem.file_system import FileSystem
from browser_use.llm.openai.chat import ChatOpenAI

from browser_agent.events import (
    done_event,
    error_event,
    screenshot_saved_event,
    step_event_from,
    unique_png_name,
)

logger = logging.getLogger(__name__)

RULES = """SCREENSHOTS: Ein Screenshot gilt nur dann als gemacht, wenn du die Aktion `screenshot` MIT `file_name` aufrufst.
Das Bild, das du bei jedem Schritt siehst, ist KEIN gespeicherter Screenshot. Behaupte nie, einen Screenshot
gemacht zu haben, ohne `screenshot` mit `file_name` aufgerufen zu haben.
COOKIE-BANNER: Lehne Cookies immer ab (z. B. "Ablehnen", "Nur notwendige", "Alles ablehnen"). Akzeptiere nie
Cookies und entferne Banner nie per JavaScript.
SICHERHEIT: Sende keine Formulare ab, kaufe nichts, melde dich nirgends an. Nur lesen, suchen, navigieren."""

PROXY_URL = "http://127.0.0.1:8899"
RUN_SECONDS = 170.0
_CLEANUP_SECONDS = 15.0

CHROMIUM_ARGS = [
    f"--proxy-server={PROXY_URL}",
    # Chromium umgeht den Proxy für Loopback sonst still; "<-loopback>" hebt das auf.
    "--proxy-bypass-list=<-loopback>",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
]


def _guard_screenshot_names(tools: Tools) -> None:
    """Die `screenshot`-Aktion überschreibt gleichnamige Dateien; vorher eindeutig machen."""
    action = tools.registry.registry.actions["screenshot"]
    original = action.function

    async def screenshot(*args, params=None, **kwargs):
        file_system = kwargs.get("file_system")
        if params is not None and params.file_name and file_system is not None:
            name = params.file_name if params.file_name.lower().endswith(".png") else f"{params.file_name}.png"
            name = FileSystem.sanitize_filename(name)
            taken = {p.name for p in file_system.get_dir().glob("*.png")}
            params = params.model_copy(update={"file_name": unique_png_name(name, taken)})
        return await original(*args, params=params, **kwargs)

    action.function = screenshot


def build_agent(
    *,
    task: str,
    start_url: str,
    llm_base_url: str,
    llm_token: str,
    workdir: Path,
    on_step: Callable | None = None,
) -> Agent:
    workdir = Path(workdir)
    llm = ChatOpenAI(model="browser_agent", base_url=llm_base_url, api_key=llm_token, timeout=120.0)
    session = BrowserSession(
        browser_profile=BrowserProfile(
            headless=True,
            user_data_dir=str(workdir / "profile"),
            args=CHROMIUM_ARGS,
            # Erweiterungen würde browser-use beim Start aus dem Netz laden — am Proxy vorbei.
            enable_default_extensions=False,
        )
    )
    tools = Tools(exclude_actions=["save_as_pdf"])
    _guard_screenshot_names(tools)
    return Agent(
        task=task,
        llm=llm,
        browser_session=session,
        tools=tools,
        use_vision="auto",
        extend_system_message=RULES,
        file_system_path=str(workdir / "fs"),
        initial_actions=[{"navigate": {"url": start_url, "new_tab": False}}],
        directly_open_url=False,
        register_new_step_callback=on_step,
        # Signale gehören uvicorn, nicht dem Agenten.
        enable_signal_handler=False,
        # Gespeichertes zählt die Platte; der Richter wäre ein zusätzlicher LLM-Aufruf je Lauf.
        use_judge=False,
    )


class RunControl:
    """Abbruch von außen (DELETE /runs/{id}), auch bevor der Agent steht."""

    def __init__(self) -> None:
        self.cancelled = False
        self._cancel: Callable[[], None] | None = None

    def cancel(self) -> None:
        self.cancelled = True
        if self._cancel is not None:
            self._cancel()


_END = object()


async def execute_run(
    req: dict,
    agent_factory: Callable = build_agent,
    *,
    base_dir: Path | None = None,
    max_seconds: float = RUN_SECONDS,
    control: RunControl | None = None,
) -> AsyncIterator[dict]:
    started = time.monotonic()
    workdir = Path(tempfile.mkdtemp(prefix="run-", dir=base_dir))
    fs_dir = workdir / "fs"
    queue: asyncio.Queue = asyncio.Queue()
    seen: list[str] = []

    def new_files() -> list[Path]:
        # browser-use registriert per `screenshot` gespeicherte PNGs nicht (#6177): die Platte zählt.
        fresh = [p for p in sorted(fs_dir.rglob("*.png")) if p.name not in seen]
        seen.extend(p.name for p in fresh)
        return fresh

    async def on_step(state, model_output, n: int) -> None:
        try:
            queue.put_nowait(step_event_from(state, model_output, n))
            for path in new_files():
                queue.put_nowait(screenshot_saved_event(path))
        except Exception:
            logger.exception("step event failed")

    agent = None
    run_task: asyncio.Task | None = None
    try:
        try:
            agent = agent_factory(
                task=req["task"],
                start_url=req["start_url"],
                llm_base_url=req["llm_base_url"],
                llm_token=req["llm_token"],
                workdir=workdir,
                on_step=on_step,
            )
        except Exception as e:
            logger.exception("agent setup failed")
            yield error_event(f"Browser-Agent konnte nicht starten: {e}")
            return

        async def runner():
            try:
                return await asyncio.wait_for(agent.run(max_steps=req.get("max_steps", 25)), max_seconds)
            finally:
                queue.put_nowait(_END)

        run_task = asyncio.create_task(runner())
        if control is not None:
            def cancel() -> None:
                agent.stop()
                run_task.cancel()

            control._cancel = cancel
            if control.cancelled:
                cancel()

        while (event := await queue.get()) is not _END:
            yield event
        for path in new_files():
            yield screenshot_saved_event(path)

        try:
            history = run_task.result()
        except asyncio.CancelledError:
            yield error_event("Lauf abgebrochen.")
        except TimeoutError:
            # Deckel gerissen: Teilergebnis statt Fehler, mit ausdrücklichem Hinweis.
            history = agent.history
            yield done_event(
                summary=history.final_result() or f"Zeitlimit von {int(max_seconds)} s erreicht – Teilergebnis.",
                agent_says_success=None,
                saved=list(seen),
                steps=history.number_of_steps(),
                seconds=time.monotonic() - started,
                timed_out=True,
            )
        except Exception as e:
            logger.exception("run failed")
            yield error_event(f"Lauf fehlgeschlagen: {e}")
        else:
            yield done_event(
                summary=history.final_result() or "",
                agent_says_success=history.is_successful(),
                saved=list(seen),
                steps=history.number_of_steps(),
                seconds=time.monotonic() - started,
            )
    finally:
        # Läuft auch bei Client-Abbruch in einem abgebrochenen anyio-Scope: abschirmen.
        with anyio.CancelScope(shield=True):
            if agent is not None:
                agent.stop()
            if run_task is not None and not run_task.done():
                run_task.cancel()
                await asyncio.wait({run_task}, timeout=_CLEANUP_SECONDS)
            if agent is not None:
                try:
                    await asyncio.wait_for(agent.close(), _CLEANUP_SECONDS)
                except Exception:
                    logger.exception("agent close failed")
            shutil.rmtree(workdir, ignore_errors=True)
