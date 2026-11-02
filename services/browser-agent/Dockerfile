# Grünerator Browser-Agent - headless Chromium (browser-use) hinter einem Egress-Proxy
#
# Build:
#   docker build -t gruenerator-browser-agent .
#
# Run:
#   docker run -p 8000:8000 -e BROWSER_AGENT_SECRET=... gruenerator-browser-agent
#
# Basis ist python:3.13-slim und nicht mcr.microsoft.com/playwright/python: dessen
# Images bringen das System-Python der Ubuntu-Basis mit (3.12), der Dienst
# verlangt aber >=3.13 (pyproject.toml). browser-use 0.13.14 hängt ausserdem
# nicht von Playwright ab, es spricht Chromium direkt per CDP an; Playwright
# dient hier nur als Installer für Chromium samt System-Bibliotheken.

FROM python:3.15-slim

WORKDIR /app

# Chromium samt Systembibliotheken (--with-deps) kommt aus einem Wegwerf-venv mit
# dem gepinnten Playwright; der Dienst selbst enthält Playwright nicht. Die
# Binärdatei liegt unter einem festen Pfad ausserhalb von $HOME, damit der
# nicht-root-Nutzer sie lesen kann und run.py sie über BROWSER_CHROMIUM_PATH
# ohne Versionsnamen im Pfad findet.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN python -m venv /opt/pw-installer \
    && /opt/pw-installer/bin/pip install --no-cache-dir playwright==1.64.1 \
    && /opt/pw-installer/bin/playwright install --with-deps chromium \
    && ln -s "$(find /ms-playwright -type f -name chrome -path '*chromium-*' | head -1)" /usr/local/bin/chromium \
    && test -x /usr/local/bin/chromium \
    && rm -rf /opt/pw-installer /var/lib/apt/lists/*

# Zweite Sperre neben `allowed_domains` (run.py): Chromium lädt weder file:// noch
# chrome://, view-source: oder devtools://, auch nicht per Klick oder Weiterleitung,
# die browser-use nicht sieht. Playwrights Chromium ist ein Chrome-for-Testing-Build
# und liest /etc/opt/chrome_for_testing (im Binary nachgesehen, Playwright 1.64.1);
# /etc/chromium deckt einen Wechsel auf reine Chromium-Builds ab. Ob die Policy
# greift, prüft evals/proxy_smoke.py (Fall „policy“) in der Image-CI.
COPY chromium-policy.json /etc/opt/chrome_for_testing/policies/managed/gruenerator.json
COPY chromium-policy.json /etc/chromium/policies/managed/gruenerator.json

# Fester venv-Pfad wie in services/nlp/Dockerfile: die Python-Minor-Version
# steht nur in der FROM-Zeile.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# requirements.txt ist der gepinnte Laufzeit-Abschluss von pyproject.toml (neu erzeugen:
# siehe Kopfzeile der Datei; requirements-dev.txt trägt zusätzlich das [dev]-Extra für die CI).
# --no-deps, weil overrides.txt die exakten Pins von browser-use für Pakete mit offenen
# Sicherheitsmeldungen anhebt: pip würde den Abschluss sonst gegen genau diese Pins
# ablehnen. Aufgelöst und geprüft hat ihn schon `uv pip compile`; `pip check` meldet
# die Overrides absichtlich als Konflikt.
COPY pyproject.toml requirements.txt ./
RUN pip install --no-cache-dir --no-deps -r requirements.txt

COPY src/ /app/src/

# Nicht-root: ein kompromittierter Renderer soll kein root im Container sein.
# Die Chromium-Sandbox bleibt trotzdem aus: browser-use hängt im Container
# (IN_DOCKER) --no-sandbox an, und ohne zusätzliche Capabilities/seccomp-Profil
# kann Chromium als Nicht-root keine User-Namespaces anlegen. Bindend ist
# daher das Netz, nicht die Sandbox: im Betrieb hängt dieser Container allein
# in einem Docker-Netz ohne Ausgang und Gateway-Adresse, und der einzige Weg
# hinaus (Internet über den Egress-Proxy, der Modell-Pfad der API) ist der
# Container `browser-gateway` aus demselben Image (gateway.py; Salt:
# docker-compose.yml.j2; geprüft von evals/topology_smoke.sh).
RUN useradd --create-home --uid 10001 agent
USER agent

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1
ENV BROWSER_CHROMIUM_PATH=/usr/local/bin/chromium
ENV ANONYMIZED_TELEMETRY=false
ENV BROWSER_USE_CLOUD_SYNC=false

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://127.0.0.1:8000/health').raise_for_status()" || exit 1

CMD ["python", "-c", "from browser_agent.api import main; main()"]
