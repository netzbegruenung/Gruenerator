# Browser-Agent

Python-Dienst (außerhalb des pnpm-Workspace), der für das Chat-Werkzeug
„Website erkunden“ einen headless Chromium (browser-use) steuert. Kein
Modell-Key im Dienst: das Modell kommt ausschließlich über die API-Lane
`browser_agent`.

## Egress-Proxy (`src/browser_agent/egress.py`)

Der Browser wird per `--proxy-server` durch einen filternden Proxy gezwungen.
Chromium läuft ohne Sandbox (siehe Dockerfile); damit ein Renderer-Exploit den
Proxy nicht einfach umgeht, läuft er im Betrieb als **eigener Container**:

- `browser-agent` hängt nur im Netz `gruenerator-browser` (`internal: true`,
  `gateway_mode_ipv4/ipv6: isolated`). Ohne `isolated` bleibt ein Dienst auf
  dem Host über die Gateway-IP erreichbar (gemessen 27.10.2026, Docker 29.5);
  die Option braucht Docker ≥ 28.
- `browser-egress` (dasselbe Image, `python -c "from browser_agent.egress import
main; main()"`, lauscht auf `:8899`) hängt zusätzlich in einem Netz mit
  Ausgang. Der Agent bekommt ihn per Env `BROWSER_EGRESS_PROXY=http://browser-egress:8899`;
  ist die Env gesetzt, startet `api.py` keinen Proxy im Prozess.
- Die API erreicht der Agent für das Modell direkt über das interne Netz.

Ohne `BROWSER_EGRESS_PROXY` (lokal, Rauchtest `proxy_smoke.py`) startet
`api.py` den Proxy im Prozess auf `127.0.0.1:8899`. Der Proxy ist die Sperre
gegen SSRF in interne Netze (Redis, Postgres, Cloud-Metadaten, eigene Host-IPs):

- Unterstützt `CONNECT host:port` und absolute-form-HTTP (`GET http://host/…`);
  alles andere ergibt `405`, Gesperrtes `403`.
- DNS löst der Proxy selbst auf, **jede** aufgelöste Adresse wird geprüft, und
  verbunden wird zur geprüften IP, nicht erneut zum Namen (kein DNS-Rebinding).
  Literale IPs (auch `[::1]`) laufen durch dieselbe Prüfung.
- Gesperrt: IPv4 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12,
  192.168/16, 224/3; IPv6 ::/96, fc00::/7, fe80::/10, fec0::/10, ff00::/8;
  IPv4-mapped IPv6 und NAT64 (64:ff9b::/96) werden anhand der eingebetteten
  IPv4 geprüft.
- Zielports: nur 80 und 443 (CONNECT und Plain-HTTP), sonst `403`;
  überschreibbar per Env `BROWSER_EGRESS_ALLOWED_PORTS` (kommagetrennte Ports).
- Env `BROWSER_EGRESS_EXTRA_BLOCKED` (kommagetrennte IPs/CIDRs) sperrt
  zusätzlich. **Die eigenen öffentlichen IPs des Hosts und der Qdrant-Host
  müssen beim Deployment dort eingetragen werden** — der Code kennt sie nicht
  und sperrt sie sonst nicht. Ein ungültiger Eintrag lässt den Start mit einem
  `ValueError` scheitern (fail-fast), statt still zu ignorieren.

Rauchtest im Image (braucht Internet für example.com/.org; läuft auch in
`.github/workflows/browser-agent-image.yml`):

```bash
docker build -t gruenerator-browser-agent services/browser-agent
docker run --rm -v "$PWD/services/browser-agent/evals:/evals" \
    gruenerator-browser-agent python /evals/proxy_smoke.py
```

Die Topologie selbst (kein direkter Ausgang, kein Host-Dienst erreichbar,
Chromium mit dem Profil aus `run.py` lädt über den Proxy-Container) prüft
`evals/topology_smoke.sh <image>`, ebenfalls in der Image-CI.

Jeder „gesperrt“-Fall in `proxy_smoke.py` lädt nachweislich ohne die Sperre (example.org vor
und nach der Zusatzsperre, ein lokaler Server mit Abrufzähler, eine
Weiterleitung auf Loopback); dazu file:// und die Chromium-Policy
`chromium-policy.json` (`URLBlocklist` für file://, chrome://, view-source:,
devtools://), die im Image unter `/etc/opt/chrome_for_testing/policies/managed/`
liegt.

## Tests

```bash
cd services/browser-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

Die Tests brauchen kein Internet: Resolver und `is_blocked` werden nur im
jeweiligen Test auf einen lokalen Stub umgebogen.

## Lauf (`src/browser_agent/api.py`, `run.py`, `events.py`)

Start: `PYTHONPATH=src python -c "from browser_agent.api import main; main()"`
(startet ohne `BROWSER_EGRESS_PROXY` auch den Egress-Proxy auf `127.0.0.1:8899`).

Alle Läufe verlangen den Header `X-Browser-Agent-Secret: $BROWSER_AGENT_SECRET`
(leer = alles `401`). Die Run-Tokens, mit denen der Dienst das Modell ruft
(`llm_token`), signiert die API mit einem **eigenen** Geheimnis
`BROWSER_AGENT_TOKEN_SECRET`, das nie in diesen Container gehört — sonst könnte
ein übernommener Browser sich Tokens für beliebige Personen ausstellen.
`BROWSER_MAX_PARALLEL` (Standard 2) begrenzt parallele
Läufe, darüber `429`.

- `POST /runs` `{run_id, task, start_url, llm_base_url, llm_token, max_steps≤25}`
  → `application/x-ndjson` mit `step`, `screenshot_saved`, `done` bzw. `error`
  (Formen in `events.py`; die API spiegelt sie als Zod-Schema — Felder nie
  umbenennen). Laufdeckel 170 s: reißt ein Lauf ihn, endet er mit einem
  Teilergebnis `done` mit `timed_out: true` und `agent_says_success: null`
  (Zusammenfassung des Agenten oder „Zeitlimit von 170 s erreicht –
  Teilergebnis.“); sonst trägt `done` `timed_out: false`. Abbruch per
  `DELETE` oder Client-Abbruch endet weiter mit `error`.
- `DELETE /runs/{run_id}` bricht ab (`204`); ein Client-Abbruch des Streams
  ebenso, ohne auf den nächsten Schritt zu warten.
- `GET /health`.

browser-use läuft mit `use_vision='auto'` (sonst entfernt es die Aktion
`screenshot`), ohne `save_as_pdf`, mit frischem Profil je Lauf (danach
gelöscht). Gespeicherte Screenshots werden **auf der Platte** gezählt, weil
browser-use sie nicht registriert (Upstream #6177); gleiche Dateinamen werden
zu `name-(1).png` statt überschrieben.
