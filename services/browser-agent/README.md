# Browser-Agent

Python-Dienst (außerhalb des pnpm-Workspace), der für das Chat-Werkzeug
„Website erkunden“ einen headless Chromium (browser-use) steuert. Kein
Modell-Key im Dienst: das Modell kommt ausschließlich über die API-Lane
`browser_agent`.

## Egress-Proxy (`src/browser_agent/egress.py`)

Der Browser wird per `--proxy-server=http://127.0.0.1:8899` durch einen
filternden Proxy gezwungen. Er ist die bindende Sperre gegen SSRF in interne
Netze (Redis, Postgres, Cloud-Metadaten, eigene Host-IPs):

- Unterstützt `CONNECT host:port` und absolute-form-HTTP (`GET http://host/…`);
  alles andere ergibt `405`, Gesperrtes `403`.
- DNS löst der Proxy selbst auf, **jede** aufgelöste Adresse wird geprüft, und
  verbunden wird zur geprüften IP, nicht erneut zum Namen (kein DNS-Rebinding).
  Literale IPs (auch `[::1]`) laufen durch dieselbe Prüfung.
- Gesperrt: IPv4 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12,
  192.168/16, 224/3; IPv6 ::/96, fc00::/7, fe80::/10, fec0::/10, ff00::/8;
  IPv4-mapped IPv6 wird als IPv4 geprüft. Zusätzlich Env
  `BROWSER_EGRESS_EXTRA_BLOCKED` (kommagetrennte IPs/CIDRs).

## Tests

```bash
cd services/browser-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

Die Tests brauchen kein Internet: Resolver und `is_blocked` werden nur im
jeweiligen Test auf einen lokalen Stub umgebogen.
