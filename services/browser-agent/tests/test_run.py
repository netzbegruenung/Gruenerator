import asyncio
import base64
import io
import logging
from types import SimpleNamespace

from PIL import Image

from browser_agent.events import step_event_from, unique_png_name
from browser_agent.run import RULES, build_agent, execute_run


def _png(w=10, h=10) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (0, 128, 0)).save(buf, "PNG")
    return buf.getvalue()


def test_agent_config(tmp_path):
    a = build_agent(task="x", start_url="https://example.org", llm_base_url="http://x", llm_token="t", workdir=tmp_path)
    assert a.settings.use_vision == 'auto'
    assert 'save_as_pdf' not in a.tools.registry.registry.actions
    assert 'screenshot' in a.tools.registry.registry.actions
    assert RULES in a.settings.extend_system_message
    assert a.llm.model == 'browser_agent'
    assert a.llm.base_url == 'http://x'
    assert a.llm.timeout == 120.0
    profile = a.browser_session.browser_profile
    assert profile.headless is True
    assert str(profile.user_data_dir).startswith(str(tmp_path))
    assert '--proxy-server=http://127.0.0.1:8899' in profile.args
    assert '--proxy-bypass-list=<-loopback>' in profile.args
    assert '--force-webrtc-ip-handling-policy=disable_non_proxied_udp' in profile.args
    assert a.settings.use_judge is False
    assert profile.allowed_domains == ['http://*', 'https://*']


def test_profile_allows_only_http_and_https(tmp_path):
    from browser_use.browser.watchdogs.security_watchdog import SecurityWatchdog

    from browser_agent.run import build_profile

    profile = build_profile(tmp_path)
    # Die echte Prüfung von browser-use, ohne Browser: sie liest nur das Profil.
    watchdog = SecurityWatchdog.model_construct(
        browser_session=SimpleNamespace(browser_profile=profile, logger=logging.getLogger('test'))
    )
    assert watchdog._is_url_allowed('https://example.org/a')
    assert watchdog._is_url_allowed('http://example.org:8080/')
    assert not watchdog._is_url_allowed('file://localhost/etc/hosts')
    assert not watchdog._is_url_allowed('file:///etc/hosts')
    assert not watchdog._is_url_allowed('chrome://settings')
    assert not watchdog._is_url_allowed('view-source:https://example.org')
    assert not watchdog._is_url_allowed('ftp://example.org/')


def test_rules_text_verbatim():
    assert "Behaupte nie, einen Screenshot" in RULES
    assert "SICHERHEIT: Sende keine Formulare ab, kaufe nichts, melde dich nirgends an." in RULES
    assert RULES.endswith("SPRACHE: Schreibe deine abschließende Zusammenfassung auf Deutsch.")


def test_duplicate_file_name_kept(tmp_path):
    assert unique_png_name("a.png", existing={"a.png"}) == "a (1).png"
    assert unique_png_name("a.png", existing=set()) == "a.png"
    # browser-use sanitizes "a (1).png" to "a-(1).png" — that counts as taken too.
    assert unique_png_name("a.png", existing={"a.png", "a-(1).png"}) == "a (2).png"


async def test_screenshot_action_does_not_overwrite(tmp_path):
    from browser_use.filesystem.file_system import FileSystem

    a = build_agent(task="x", start_url="https://example.org", llm_base_url="http://x", llm_token="t", workdir=tmp_path)
    fs = FileSystem(str(tmp_path / "fs-test"))
    session = SimpleNamespace(take_screenshot=lambda full_page=False: asyncio.sleep(0, result=_png()))
    action = a.tools.registry.registry.actions["screenshot"]
    params = action.param_model(file_name="seite")
    await action.function(params=params, browser_session=session, file_system=fs)
    await action.function(params=params, browser_session=session, file_system=fs)
    names = sorted(p.name for p in fs.get_dir().glob("*.png"))
    assert names == ["seite-(1).png", "seite.png"]


def _state(screenshot_b64, selector_map=None, scroll=(0, 0)):
    return SimpleNamespace(
        url="https://example.org/a",
        title="Beispiel",
        screenshot=screenshot_b64,
        page_info=SimpleNamespace(viewport_width=1000, viewport_height=500, scroll_x=scroll[0], scroll_y=scroll[1]),
        dom_state=SimpleNamespace(selector_map=selector_map or {}),
    )


def _action(d):
    return SimpleNamespace(model_dump=lambda **kw: d)


def test_click_position_pct():
    node = SimpleNamespace(absolute_position=SimpleNamespace(x=100, y=50, width=20, height=10),
                           ax_node=None, get_meaningful_text_for_llm=lambda: "Ablehnen")
    shot = base64.b64encode(_png(2048, 1024)).decode()
    out = SimpleNamespace(next_goal="Cookies ablehnen", thinking=None,
                          action=[_action({"click": {"index": 7}})])
    ev = step_event_from(_state(shot, {7: node}), out, 3)
    assert ev["type"] == "step" and ev["n"] == 3
    assert ev["action"] == "click"
    assert ev["x_pct"] == 11.0 and ev["y_pct"] == 11.0
    assert ev["target"] == "Ablehnen"
    assert ev["thought"] == "Cookies ablehnen"
    img = Image.open(io.BytesIO(base64.b64decode(ev["screenshot_jpeg_b64"])))
    assert img.format == "JPEG" and img.width == 1024


def test_click_position_respects_scroll():
    node = SimpleNamespace(absolute_position=SimpleNamespace(x=100, y=1050, width=20, height=10),
                           ax_node=None, get_meaningful_text_for_llm=lambda: "")
    out = SimpleNamespace(next_goal=None, thinking=None, action=[_action({"click": {"index": 1}})])
    ev = step_event_from(_state(None, {1: node}, scroll=(0, 1000)), out, 1)
    assert ev["y_pct"] == 11.0
    assert ev["screenshot_jpeg_b64"] == ""


def _click_on(node):
    out = SimpleNamespace(next_goal=None, thinking=None, action=[_action({"click": {"index": 1}})])
    return step_event_from(_state(None, {1: node}), out, 1)


def test_icon_only_target_falls_back_to_aria_label():
    # Icon-Font-Zeichen (Private Use) als Name — erschien in der Schrittliste als „☒".
    node = SimpleNamespace(absolute_position=None, ax_node=SimpleNamespace(name="\ue8b6"),
                           attributes={"aria-label": "Suche öffnen"},
                           get_meaningful_text_for_llm=lambda: "\ue8b6")
    assert _click_on(node)["target"] == "Suche öffnen"


def test_icon_only_target_without_label_is_null():
    node = SimpleNamespace(absolute_position=None, ax_node=SimpleNamespace(name=" \uf101\u200b "),
                           attributes={}, get_meaningful_text_for_llm=lambda: "\x07\ue000")
    assert _click_on(node)["target"] is None


def test_target_strips_unreadable_chars_and_collapses_whitespace():
    node = SimpleNamespace(absolute_position=None, ax_node=SimpleNamespace(name="\ue8b6  Klima\u200bschutz\n\t Seite"),
                           attributes={}, get_meaningful_text_for_llm=lambda: "")
    assert _click_on(node)["target"] == "Klimaschutz Seite"


def test_no_click_no_position():
    out = SimpleNamespace(next_goal=None, thinking="hm", action=[_action({"navigate": {"url": "https://x.org"}})])
    ev = step_event_from(_state(None), out, 1)
    assert ev["x_pct"] is None and ev["y_pct"] is None
    assert ev["action"] == "navigate" and ev["target"] == "https://x.org"
    assert ev["thought"] == "hm"


class _History:
    def final_result(self):
        return "fertig"

    def is_successful(self):
        return True

    def number_of_steps(self):
        return 2


class FakeAgent:
    """Ahmt die Teile von browser_use.Agent nach, die der Lauf benutzt."""

    def __init__(self, workdir, on_step, steps=2, delay=0.0, png_names=()):
        self.workdir = workdir
        self.on_step = on_step
        self.steps = steps
        self.delay = delay
        self.png_names = png_names
        self.stopped = False
        self.closed = False
        self.history = SimpleNamespace(final_result=lambda: None, number_of_steps=lambda: self.done_steps)
        self.done_steps = 0
        (workdir / "profile").mkdir(parents=True, exist_ok=True)
        self.fs_dir = workdir / "fs" / "browseruse_agent_data"
        self.fs_dir.mkdir(parents=True, exist_ok=True)

    async def run(self, max_steps):
        for n in range(1, self.steps + 1):
            if self.stopped:
                break
            out = SimpleNamespace(next_goal=f"schritt {n}", thinking=None, action=[_action({"wait": {"seconds": 1}})])
            for name in self.png_names:
                (self.fs_dir / name).write_bytes(_png())
            await self.on_step(_state(None), out, n)
            self.done_steps = n
            await asyncio.sleep(self.delay)
        return _History()

    def stop(self):
        self.stopped = True

    async def close(self):
        self.closed = True


async def test_saved_counts_disk_not_registry(tmp_path):
    made = []

    def factory(*, workdir, on_step, **kw):
        made.append(FakeAgent(workdir, on_step, png_names=("eins.png", "zwei.png")))
        return made[0]

    req = dict(run_id="r1", task="t", start_url="https://example.org", llm_base_url="http://x", llm_token="t", max_steps=25)
    events = [ev async for ev in execute_run(req, factory, base_dir=tmp_path)]
    saved_events = [e for e in events if e["type"] == "screenshot_saved"]
    assert sorted(e["file_name"] for e in saved_events) == ["eins.png", "zwei.png"]
    assert base64.b64decode(saved_events[0]["png_b64"]).startswith(b"\x89PNG")
    done = events[-1]
    assert done["type"] == "done"
    assert sorted(done["saved"]) == ["eins.png", "zwei.png"]
    assert done["timed_out"] is False
    assert done["summary"] == "fertig" and done["agent_says_success"] is True and done["steps"] == 2
    assert [e["n"] for e in events if e["type"] == "step"] == [1, 2]
    assert not made[0].workdir.exists()


async def test_run_timeout_emits_partial_done(tmp_path):
    made = []

    def factory(*, workdir, on_step, **kw):
        made.append(FakeAgent(workdir, on_step, steps=100, delay=0.05, png_names=("eins.png",)))
        return made[0]

    req = dict(run_id="r1", task="t", start_url="https://example.org", llm_base_url="http://x", llm_token="t", max_steps=25)
    events = [ev async for ev in execute_run(req, factory, base_dir=tmp_path, max_seconds=0.2)]
    done = events[-1]
    assert done["type"] == "done"
    assert done["timed_out"] is True
    assert done["agent_says_success"] is None
    assert done["summary"] == "Zeitlimit von 0 s erreicht – Teilergebnis."
    assert done["saved"] == ["eins.png"]
    assert done["steps"] >= 1
    assert not any(e["type"] == "error" for e in events)
    assert made[0].stopped
    assert list(tmp_path.iterdir()) == []


async def test_run_timeout_uses_partial_final_result(tmp_path):
    def factory(*, workdir, on_step, **kw):
        agent = FakeAgent(workdir, on_step, steps=100, delay=0.05)
        agent.history.final_result = lambda: "halb fertig"
        return agent

    req = dict(run_id="r1", task="t", start_url="https://example.org", llm_base_url="http://x", llm_token="t", max_steps=25)
    events = [ev async for ev in execute_run(req, factory, base_dir=tmp_path, max_seconds=0.2)]
    assert events[-1]["summary"] == "halb fertig" and events[-1]["timed_out"] is True


def test_chromium_uses_the_external_proxy_from_env(monkeypatch):
    import importlib

    import browser_agent.run as run

    monkeypatch.setenv("BROWSER_EGRESS_PROXY", "http://browser-egress:8899")
    try:
        assert "--proxy-server=http://browser-egress:8899" in importlib.reload(run).CHROMIUM_ARGS
    finally:
        monkeypatch.delenv("BROWSER_EGRESS_PROXY")
        assert "--proxy-server=http://127.0.0.1:8899" in importlib.reload(run).CHROMIUM_ARGS
