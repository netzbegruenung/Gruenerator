# perf-eval

Mess- und Prüfskripte für den Canvas-Editor. Vorgehen, Setup und Fallen: `docs/CLAUDE-canvas-eval.md`.

**Im Browser:**

- `harness.js` läuft in der Seite. Es liefert Render-Zähler über den DevTools-Hook, Long Tasks und Frames sowie einen synthetischen Drag.

**Mit Node und playwright-core** (`PW_CORE=<pfad zu playwright-core>`):

- `mobile-harness.cjs`: Touch-Szenarien per CDP auf einem Handy-Viewport, mit CPU-Drossel.
- `mobile-verify.cjs`: einzelne Live-Prüfungen der mobilen Befunde (#4385–#4393).

**Trace-Auswertung** (`*.json.gz`):

- `analyze-trace.cjs`
- `fn-in-tasks.cjs`
- `events-in-tasks.cjs`
- `lt-detail.cjs`
- `long-frames.cjs`
- `per-event.cjs`
- `keydown-breakdown.cjs`
