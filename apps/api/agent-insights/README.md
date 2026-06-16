# PR-Agent Korpus-Einblicke (auto-generiert)

Die Dateien `*.md` in diesem Ordner werden **automatisch** vom monatlichen Workflow
`.github/workflows/pr-agent-insights.yml` erzeugt — pro Öffentlichkeitsarbeit-Agent eine.

Sie sind ein **Audit-Artefakt**: Der Live-Agent zieht denselben Inhalt zur Laufzeit aus
der Datenbank (`pr_agent_insight_snapshots`), nicht aus diesen Dateien. Der monatlich
geöffnete `automated`-PR muss daher **nicht gemergt werden, damit die Änderung wirkt** —
er dient nur der Transparenz und der Drift-Historie (wie sich Themen, Sprecher\*innen und
Stil der Agents Monat für Monat verändern).

Nicht von Hand editieren — Änderungen werden beim nächsten Lauf überschrieben.
Siehe `apps/api/services/agents/prAgentInsightService.ts`.
