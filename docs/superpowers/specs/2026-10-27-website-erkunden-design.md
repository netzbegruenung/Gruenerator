# „Website erkunden" — Browser-Agent im Chat

Stand: 27.10.2026 · Status: freigegeben (Moritz, 27.10.2026)

## Absicht

Nutzer*innen sollen im Chat sagen können „erkunde Seite X und mach Screenshots" — ein Agent bedient dafür einen echten Browser (klicken, suchen, Cookie-Banner, Formular-Suche in Ratsinformationssystemen), und man sieht ihm **live in der Sidebar** dabei zu. Ergebnis: eine kurze Zusammenfassung plus die gespeicherten Screenshots.

Wofür die Screenshots später genutzt werden, ist bewusst offen (Moritz: „wissen wir noch nicht"). Das Feature soll den Mechanismus verlässlich liefern; Anschlussnutzungen (Sharepic, Dokument, Vergleich) kommen später.

Warum nicht der bestehende Crawler: `CrawlingService`/`CrawleeCrawler` holen Seiten ab, bedienen sie aber nicht (keine Suchformulare, keine Banner, keine Klickpfade). Und der Playwright-Rückfall im Crawler hat im API-Image vermutlich gar kein Chromium (`apps/api/Dockerfile`: kein `playwright install`, keine Browser-Libs) — ungeprüft, eigenes Thema.

## Ziele

- Werkzeug `website_erkunden` im agentischen Chat (Web), Aufruf aus normaler Sprache.
- Live-Ansicht in der bestehenden Artefakt-Sidebar: pro Schritt ein Screenshot, Cursor/Spur an der Klickposition, Schrittliste, aktuelle URL.
- Screenshots als PNG, im Chat abrufbar; Zusammenfassung als Antwort.
- Ansicht nach Reload aus der Nachricht wiederherstellbar.
- Erst lokal testen, danach für **alle** eingeloggten Nutzer*innen.

## Nicht-Ziele

- Mobile-App (Web zuerst).
- Eingeloggte Seiten, eigene Konten, Cookies/Profile über Läufe hinweg.
- Formulare **absenden**, kaufen, posten — nur lesen, suchen, navigieren.
- Echtes Live-Video (Screencast/VNC).
- Ablage in der Mediathek.
- Stealth/Anti-Bot-Umgehung.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- **Der Browser erreicht interne Adressen** (Redis, Postgres, Qdrant, Metadaten-Endpunkte, Docker-Netz). Chromium umgeht `validateUrlForFetch` bei jedem Klick, Bild, Redirect und JS-Request — eine Prüfung der Start-URL genügt nicht.
- **Der Agent akzeptiert Cookies** im Namen der Partei oder räumt Banner per JavaScript weg (Large 4 hat im Spike „Alle akzeptieren" geklickt).
- **Die Antwort behauptet Screenshots, die es nicht gibt.** Im Spike meldeten Gemma und Large 4 in 4 von 6 Läufen „Screenshot erstellt" ohne Datei.
- Abfluss an Nicht-EU-Anbieter (keine browser-use-Cloud, keine Telemetrie).

## Belege aus dem Spike (27.10.2026)

Drei Aufgaben (gruene.de erkunden; stadt-muenster.de mit Cookie-Banner → Klimaschutz; Ratsinfo Bonn, Suche „Radverkehr" → Treffer öffnen), browser-use 0.13.14, lokales Chrome headless:

| | Mistral Medium 3.5 | Mistral Large 4 | Gemma 4 31B `:speed`, Denken aus |
|---|---|---|---|
| Navigation gelöst | 3/3 | 3/3 | 3/3 |
| Dauer | 2:44–5:28 | 4:39–7:00 | **0:43–2:01** |
| Prompt-Tokens | 184k–293k | 95k–196k | 91k–257k |
| Dateien gespeichert | 3/3 (PDF) | 1/3 (PDF) | 1/3 (PDF) |
| Speichern behauptet ohne Datei | 0/3 | 2/3 | 2/3 |
| `screenshot`-Aufrufe | 0 | 0 | 0 |

Gemma `:balanced` mit Denken: unbrauchbar (Zeitüberschreitungen > 75 s). Melious-Vorabschätzung ~0,005 € pro Schritt.

**Ursache der Screenshot-Fehler: Konfiguration, nicht Modell.** browser-use entfernt das Werkzeug `screenshot` vollständig, sobald `use_vision != 'auto'` (`browser_use/agent/service.py:319-325`, eingeführt mit Upstream-PR #3651). Die Läufe oben hatten `use_vision=True` — kein Modell hatte überhaupt ein Screenshot-Werkzeug; sie wichen auf `save_as_pdf` aus oder behaupteten Screenshots. Verwandt upstream: #942, #3989 (optionaler `file_name`), offen #6177/#6180 (gespeicherte Dateien fehlen im Datei-Register von browser-use).

**Validierungstest bestanden (27.10.2026), 6/6.** Gemma `:speed`, Denken aus, `use_vision='auto'`, `exclude_actions=['save_as_pdf']`, Regel-Text (unten), jede Aufgabe zweimal: in allen 6 Läufen ruft das Modell `screenshot` mit `file_name`, jede gemeldete Datei liegt auf der Platte; Cookie-Banner beide Male per „Alles ablehnen". 40–92 s, 7–13 Schritte, 91k–163k Prompt-Tokens (weniger als mit `use_vision=True`, weil Bilder nur auf Anfrage ins Modell gehen). Grenzfälle: einmal „Input exceeds model context window" (131k, Modell fing sich), einmal derselbe Dateiname zweimal (überschrieben) → Dateinamen im Dienst eindeutig machen.

Der Schritt-Screenshot für die Live-Ansicht entsteht unabhängig davon in jedem Schritt (`agent/service.py:1098`, `include_screenshot=True`) und steht im Schritt-Callback (`register_new_step_callback`, `BrowserStateSummary.screenshot`) bereit.

Spike-Code und Ergebnisse (nicht im Repo): `/private/tmp/claude-501/-Users-moritzwachter-Gruenerator/b8d1144e-f8cf-4dab-8a3d-803c9f7c401f/scratchpad/bu-scripts/` und `…/bu-out*`.

## Entscheidungen von Moritz

- Live-Ansicht = **Screenshot pro Schritt** über den bestehenden SSE-Stream, kein eigener Kanal.
- Screenshots **nur im Chat** (`computeAssetStorage`: an Nutzer*in gebunden, nur eingeloggt, 90 Tage).
- Sidebar-Ansicht **nach Reload wiederherstellbar** aus den Nachrichten-Metadaten (anders als das Research-Log heute).
- Zugang: **lokal testen, dann alle**.
- Bei der Screenshot-Mechanik **bei browser-use bleiben** (Konfiguration + Prompt), kein eigenes Screenshot-Werkzeug — Validierungstest bestanden.
- Modellweg: **über die API** (kein Modell-Key im Dienst).
- Hosting: „ähnlich wie nlp", Ausgestaltung Claude überlassen (siehe Deployment).
- browser-use-Version im Dienst exakt pinnen (getestet: 0.13.14).
- Live-Rahmen: **assistant-ui Element „Computer Use"** (https://www.assistant-ui.com/elements/computer-use).

## Aufbau

### 1. Dienst `services/browser-agent` (Python)

Eigener Dienst nach dem Muster `services/nlp` (FastAPI, eigenes Image `gruenerator-browser-agent` in `build-images.yml`, außerhalb des pnpm-Workspace, pytest im eigenen CI-Job). Basis-Image mit Chromium und Systembibliotheken (z. B. Playwright-Python-Image).

**Modellweg (Moritz: über die API).** Der Dienst hat **keine** Modell-Keys. browser-use spricht über seinen OpenAI-Adapter (`ChatOpenAI`, `base_url`) einen **internen OpenAI-kompatiblen Endpunkt der API** an (`/internal/browser-agent/v1/chat/completions` o. ä., nur im Netz `gruenerator-browser` erreichbar, Shared Secret). Die API ruft dahinter `aiText`/`aiObject` aus `services/ai/generate.ts` mit fester Lane (neue Zeile in `AI_LANES` für den Browser-Agenten bzw. `AiCall.pinned`) — damit gelten Routing, `AiProviderError`, Nutzungszeilen in `user_usage_daily` (der Lauf läuft im Namen der auslösenden Person; die API ordnet Endpunkt-Aufrufe über eine Lauf-ID zu, die sie selbst vergeben hat) und Provider-Liste ohne zweiten Weg. Der Endpunkt muss das tragen, was browser-use schickt: Bild-Teile in `messages`, `response_format: json_schema` (strukturierte Ausgabe), `reasoning_effort`. Der Umweg kostet pro Schritt einen internen Rundlauf.

**Deployment (Entscheidung Claude, nach Prüfung von Salt `states/gruenerator-docker/files/docker-compose.yml.j2`).** Wie `nlp` als Dienst im Salt-Compose auf demselben Host — aber **nicht** im Netz `gruenerator` (dort hängen redis, nginx, api, nlp). Eigenes Netz `gruenerator-browser`, an das zusätzlich nur `api` angehängt wird; kein `extra_hosts`/`host-gateway`. Weil ein Bridge-Netz trotzdem die öffentlichen IPs des eigenen Hosts und den Qdrant-Host (`qdrant-host-ipv6`) erreicht, ist der filternde Egress-Proxy (unten) die verbindliche Schranke, nicht das Netz allein. API-seitig `BROWSER_AGENT_URL=http://browser-agent:8000` + Secret in `backend.env.j2`/Pillar. **Salt macht Claude** (Moritz, 27.10.): als eigener Commit auf dem bestehenden Salt-Branch `gruenerator-videoeditor` (Worktree `~/Salt/videoeditor`, berührt dieselben Dateien), ein gemeinsamer Salt-PR, Konventionen aus `salt-repo-conventions` (keine erklärenden Kommentare, Rumpf beginnt mit Aufzählungspunkt). Das Secret selbst legt Moritz in Passbolt an; der Commit referenziert die Pillar-UUID.

- `POST /runs` `{task, start_url, locale, max_steps}` → Strom (NDJSON oder SSE) von Ereignissen:
  - `step`: `{n, url, title, action, target, x_pct, y_pct, screenshot_jpeg_b64, thought}` — Screenshot verkleinert (Breite ~1024, JPEG), Klickposition aus `selector_map[index].absolute_position` relativ zum Viewport.
  - `screenshot_saved`: `{file_name, png_b64}` sobald browser-use eine Datei schreibt.
  - `done`: `{summary, agent_says_success, saved: [file_name…]}` — `saved` ist **auf der Platte gezählt**, nicht aus dem Datei-Register von browser-use (#6177).
  - `error`.
- Fest eingestellte Konfiguration:
  - Modell (in der Lane der API, nicht im Dienst): Gemma 4 31B über Melious, Flavor **`:speed`**, `reasoning_effort: 'none'` (in browser-use nur über `reasoning_models=[model]` wirksam, sonst schickt der Adapter es nicht). HTTP-Timeout im Dienst explizit setzen (Default der browser-use-Adapter ist zu kurz; beim Mistral-Adapter brach jeder Aufruf nach 5 s still ab).
  - Rückfall bei Melious-Ausfall: Mistral Medium 3.5 (`mistral-medium-2604`), nicht Large 4. *Entscheidung Claude:* gewählt wird nur beim Start eines Laufs, kein Wechsel mitten im Lauf. Medium braucht laut Spike oft länger als der Deckel; reißt er ihn, gibt es ein Teilergebnis mit ausdrücklichem Hinweis, keinen längeren Deckel.
  - **`use_vision='auto'`** (Pflicht — sonst gibt es kein `screenshot`-Werkzeug) und `Tools(exclude_actions=['save_as_pdf'])`.
  - `extend_system_message`: Screenshot zählt nur mit `screenshot` + `file_name`; das Beobachtungsbild ist keiner. Cookie-Banner immer ablehnen, nie akzeptieren, nie per JS entfernen. Nichts absenden, nichts kaufen, nicht einloggen.
  - `max_steps` 25, Gesamtlaufzeit-Deckel ~180 s, frisches Profil pro Lauf, danach löschen.
  - `ANONYMIZED_TELEMETRY=false`, keine Cloud-Sync.
- **Netzsperre:** Chromium darf nur öffentliche Adressen erreichen. Chromium läuft zwingend über einen filternden Egress-Proxy im Container (`--proxy-server`, kein Direktweg; DNS-Auflösung im Proxy, Prüfung der aufgelösten Adresse beim Verbinden, nicht nur des Namens), der dieselben Bereiche sperrt wie `isPrivateAddress` (`apps/api/utils/validation/urlSecurity.ts`; PR #5011 erweitert sie um ULA/Link-Local/CGNAT und ist noch offen — die Liste im Dienst muss mindestens diesen Stand haben) **plus** konfigurierbare Zusatz-Sperren (öffentliche IPs des eigenen Hosts, Qdrant-Host). WebSockets und WebRTC laufen ebenfalls über den Proxy bzw. sind abgeschaltet. Pflichttest: aus dem Browser heraus `http://169.254.169.254/`, private IPv4, private IPv6, eine Zusatz-Sperre und ein öffentlicher Redirect auf eine private Adresse — alles abgelehnt.
- Auth zwischen API und Dienst: geteiltes Secret im Header (Env, wie andere interne Dienste).
- Gleichzeitigkeit: begrenzte Zahl paralleler Browser je Instanz (Chromium ~300–500 MB); darüber 429 → API meldet „gerade ausgelastet".

### 2. API: Werkzeug `website_erkunden`

- Eintrag im Chat-Katalog (`apps/api/routes/chat/agents/toolCatalog.ts`, Vorbild `scrape_url` :552), deutscher Beschreibungstext mit „NUTZE WENN:". Hinter einen Lader (`toolScope.ts` `DEFERRABLE_GROUPS`) — das Token-Budget der aktiven Werkzeugliste ist laut `toolScopeBudget.vitest.ts` ausgeschöpft.
- Start-URL vorab mit `validateUrlForFetch` prüfen (früher Abbruch mit klarer Meldung; die eigentliche Sperre sitzt im Dienst).
- Bekommt `ctx.sse` (wie `editorTools.ts`) und reicht Schritte als neue Events `browser_session_start` / `browser_session_update` weiter — in allen Gliedern der Kette: `SSEEventType` + `SSEEventPayloads` (`sseHelpers.ts`), Zod-Schema in `packages/contracts/src/schemas/chatStreamEvents.ts`, `parseSSEStream.ts`.
- Screenshots (Schritt-JPEGs und gespeicherte PNGs) über `computeAssetStorage` ablegen; im Stream und in den Metadaten stehen nur URLs, kein Base64.
- Parameter: `url` (Pflicht), `auftrag` (Pflicht, Freitext), `screenshots_erwartet` (optional, Zahl; *Entscheidung Claude*). Ergebnis an das Modell: Zusammenfassung + Liste der **tatsächlich** auf der Platte gezählten Dateien. Liegen weniger vor als `screenshots_erwartet`, steht das ausdrücklich im Ergebnis, damit die Antwort es nicht schönredet.
- *Entscheidung Claude:* Das Werkzeug wird für alle Clients montiert (es gibt heute keine Unterscheidung nach Client beim Montieren). Mobile bekommt keine Live-Ansicht, nur die generische Werkzeug-Karte mit Ergebnis.
- Kosten: über den Modellweg in `user_usage_daily` (Anbieter + Modell). `toolCostLedger.ts` ist nur Buchführung pro Turn und bleibt, wie es ist. Kein Geldbudget pro Person; begrenzt wird über die Zahl der Läufe (Rate-Limit unten).
- **Laufzeit:** das Werkzeug braucht ein eigenes Zeitlimit (~180 s) statt `perCallTimeoutMs` 20 s, und der Loop darf es nicht über `wallClockMs` (120 s) abwürgen (`agenticLoop/types.ts:179`, `loopBudget.ts`). Wie das gelöst wird (Ausnahme pro Werkzeug, Budget-Verlängerung während des Laufs), entscheidet, wer baut.
- Nutzungs- und Kostenerfassung über den bestehenden Pfad (`toolCostLedger.ts`); Melious-Kosten des Laufs zurückmelden lassen.
- Rate-Limit pro Nutzer*in (z. B. wenige Läufe pro Stunde), weil „für alle" freigegeben wird.
- Freischaltung für die lokale Testphase: Werkzeug nur montieren, wenn `BROWSER_AGENT_URL` gesetzt ist. Für „alle" genügt dann das Setzen in Prod.

### 3. Web: Sidebar-Ansicht

- Neuer Typ `browser_session` in `ActiveArtifact` (`packages/chat/src/stores/artifactLiveStore.ts`) mit `upsertBrowserSession` nach dem Muster `upsertResearchLog`; Zweig + Badge in `ArtifactPanel.tsx`, von den html-`srcDoc`-/Download-Pfaden ausgenommen.
- Ansicht `BrowserSessionView`: das assistant-ui-Element **Computer Use**, über die schon eingetragene `@assistant-ui`-Registry nach `packages/chat/src/components/assistant-ui/elements/` übernommen (Adapter wie bei den anderen Elementen). Hintergrund = aktueller Schritt-Screenshot, `steps` = Klickpositionen, `activeIndex` = letzter Schritt; darunter die Schrittliste (Aktion, Ziel, Gedanke) und am Ende die gespeicherten PNGs.
- Öffnet sich automatisch bei `browser_session_start` (wie das Research-Log, `canAutoOpenArtifactPanel()`).
- Laufend gestrichelt/animiert, beendet/fehlgeschlagen klar unterscheidbar; Abbruch durch die Nutzer*in bricht den Lauf im Dienst ab.

### 4. Web: Karte in der Nachricht

- Werkzeug-Eintrag in `UI_TOOL_NAMES`/`TOOL_REGISTRY` (`packages/chat/src/lib/toolRegistry.ts`) und `TOOL_METADATA` (`toolResults.ts`) — `toolCatalogUiCoverage.vitest.ts` verlangt das.
- Karte: Start-URL, Dauer, Zahl der Schritte, Galerie der gespeicherten PNGs, Knopf „Ansehen" öffnet die Sidebar.
- Nach Reload: Schritte + Screenshot-URLs liegen in den Nachrichten-Metadaten (`GrueneratorMessageMetadata`), die Karte stellt die Sidebar daraus wieder her.

## Weiche (nach Test entschieden)

Kein automatisches Fotografieren nach jedem Seitenwechsel — das Modell-Werkzeug `screenshot` trägt (6/6). Die Prüfung „auf der Platte gezählt" bleibt trotzdem, und ein Spike-Ablauf mit 6 Läufen gehört als manuelles Eval-Skript in `services/browser-agent/evals/`, damit ein browser-use-Update (Werkzeugnamen, `use_vision`-Logik) nicht still dieselbe Lücke wieder aufreißt.

## Dem Bauenden überlassen

Strom-Format zwischen Dienst und API, Technik der Netzsperre (mit Pflichttest), Mechanismus der Laufzeit-Ausnahme, JPEG-Größe/Qualität, Gestaltung der Schrittliste im Rahmen von `docs/CLAUDE-styling.md` und `docs/CLAUDE-a11y.md`, Aufteilung in PRs.
