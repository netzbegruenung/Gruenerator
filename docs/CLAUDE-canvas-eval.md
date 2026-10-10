# Canvas-Editor evaluieren: Performance, Touch, WebView

Learnings aus zwei Evaluationen vom 10.10.2026: zuerst „so flüssig wie Canva" auf dem Desktop (PR #4382), danach Mobil und App-WebView (Issues #4383–#4400). Das Dokument beschreibt vor allem, **wie** gemessen wurde und **was dabei funktioniert hat und was nicht**. Die Werkzeuge liegen in `packages/canvas-editor/scripts/perf-eval/`.

## Kurzfassung: so geht man vor

1. **Den Prod-Build messen, nicht den Dev-Server.** Der React Compiler läuft nur im Prod-Build (`apps/web/vite.config.ts`). Dev-Zahlen überschätzen die Render-Kosten deutlich.
2. **Mit gedrosselter CPU und Long Tasks messen**, nicht mit FPS-Anzeigen:
   - 4x entspricht einem Mittelklasse-Handy, 6x einem schwachen Android.
   - Gezählt werden Long Tasks > 50 ms, Frames > 33 ms und das p95 der Frame-Zeit.
3. **Szenarien festlegen und vorher und nachher gleich ausführen:**
   - Auswahl, 2 s Drag und die 4 s danach
   - Tippen
   - Slider und Resize
   - Zoom
   - Leerlauf mit Auswahl
4. **Code-Audits an Subagents geben, die Live-Belege selbst erbringen.** Subagents liefern viele plausible Kandidaten. Rund ein Drittel davon hielt der Live-Prüfung nicht stand (siehe unten).
5. **Jede Ursache im Trace zuordnen**, bevor man fixt. Einige Hypothesen waren falsch, etwa dass der Reflow pro Event zu teuer sei.

## Setup, das funktioniert hat

**Stack mit Auth-Bypass auf freien Ports.**
- Die Ports 3000, 3001, 1240 und 3011 sind oft von anderen Sessions belegt.
- Turbo filtert `PORT` weg, deshalb die API direkt starten:
  ```bash
  cd apps/api && PORT=3101 HOCUSPOCUS_PORT=1340 HEALTH_PORT=1341 DOTENV_CONFIG_PATH=$PWD/../../.env \
    NODE_ENV=development HOCUSPOCUS_ENABLED=true NODE_OPTIONS=--conditions=development \
    npx tsx --import ./instrument.ts server.ts
  cd apps/web && VITE_E2E_AUTH_BYPASS=true VITE_DEV_AUTH_BYPASS_TOKEN=local-dev-bypass-token \
    NODE_OPTIONS=--max-old-space-size=6144 npx vite build --outDir <dir>
  VITE_E2E_AUTH_BYPASS=true VITE_DEV_AUTH_BYPASS_TOKEN=local-dev-bypass-token VITE_PREVIEW_API=http://localhost:3101 \
    VITE_DEV_HOCUSPOCUS=ws://localhost:1340 npx vite preview --outDir <dir> --port 3100 --host
  ```
- Der Preview-Proxy hängt den Bypass-Header an und schreibt `origin` um. Deshalb funktioniert der Login auch aus Simulatoren und Emulatoren.

**Seite über `http://[::1]:3100` öffnen.**
- Der Bypass akzeptiert `localhost`, `127.0.0.1` und `[::1]`.
- `index.html` lädt react-scan aber nur auf `localhost` und `127.0.0.1`.
- `[::1]` ist damit der Weg zu sauberen Messungen. `localhost` nimmt man nur, wenn man react-scan sehen will.

**Eingebetteten Modus nachstellen.**
- `?embedded=1` an die URL hängen.
- Per Init-Script `window.ReactNativeWebView = { postMessage }` stubben und die Nachrichten mitschreiben. So sieht man, was die Seite an die App schickt (`CLOSE`, `DOWNLOAD_FILE`, `SESSION_LOST` …).

**Render-Zähler ohne react-scan.**
- `harness.js` hängt sich an `__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot` und zählt Commits pro Komponente.
- react-scan ersetzt den Hook selbst. Läuft es mit, muss man dessen `onCommitFiberRoot` umwickeln, sonst zählt man nichts.

**Echte Touch-Gesten per CDP.**
- Das Werkzeug ist `mobile-harness.cjs` bzw. `mobile-verify.cjs` mit playwright-core und dem installierten Chrome (`channel: 'chrome'`).
- Viewport 390×844, DPR 3, `isMobile` und `hasTouch`.
- Die Gesten:
  - `Input.dispatchTouchEvent` für Tap, Drag und zwei Finger
  - `Input.synthesizeScrollGesture` (touch) für Scrollen
  - `Input.synthesizePinchGesture` für Pinch
- Synthetische `TouchEvent`s aus `evaluate` reichen für Konva, scrollen aber nicht nativ. Für Scroll- und Gesten-Fragen braucht es CDP.
  ```bash
  PW_CORE=<pfad>/node_modules/playwright-core node mobile-harness.cjs "http://[::1]:3100/studio/canvas/<id>?embedded=1" 4
  PW_CORE=… OUT=shots node mobile-verify.cjs "<url>" 1 pinchTwoElements,zoomReach,gutterDeselect,tapOtherPage,tapJitter,anchors,textEdit,share,reflow6x
  NOSHARE=1 …   # navigator.share entfernen = Android-WebView simulieren
  TRACE=drag.json node mobile-harness.cjs "<url>" 6 drag   # Chrome-Trace um den Drag
  ```

**Trace-Auswertung.**
- `analyze-trace.cjs` liefert die Long Tasks mit Aufrufern.
- `fn-in-tasks.cjs` und `events-in-tasks.cjs` zeigen, welche Funktionen und Events in Long Tasks stecken.
- `lt-detail.cjs` braucht `performance.mark('scn:drag')`.
- Die Traces nimmt man per chrome-devtools-MCP (`performance_start_trace` mit `filePath` **im Worktree**, Pfade außerhalb lehnt das Tool ab) oder per `browser.startTracing` in playwright auf.

**Event Timing API für Eingabelatenz.**
- `PerformanceObserver({ type: 'event', durationThreshold: 16 })` misst die Zeit vom Tastendruck bis zum Bild.
- Mit 1x CPU ist das verlässlicher als Traces bei Drossel, siehe unten.

**Bundle-Analyse ohne Tools.**
- Aus dem Build-Output den statischen Importgraphen per Regex aufbauen (`from"./x.js"` und `import"./x.js"`).
- Dann die Hülle ab `CollabCanvasStudioPage-*.js` bilden.
- So fiel auf, dass `cn()` mit recharts im selben Chunk liegt (#4383).
- Der Netzwerkbaum des Traces (`NetworkDependencyTree`) zeigt zusätzlich, was beim Öffnen wirklich nachgeladen wird.

**iOS-Simulator nur zum Anschauen.**
- Befehle: `xcrun simctl boot`, `xcrun simctl openurl <udid> "http://[::1]:3100/…"`, dann `xcrun simctl io <udid> screenshot`.
- Damit kann man master und Branch nebeneinander vergleichen, etwa beim WebKit-Textmessen (#4400).

**Android-Emulator für Funktionstests.**
- Starten mit `emulator -avd <avd> -no-window` und `adb reverse tcp:3100 tcp:3100`.
- Chrome öffnet `http://127.0.0.1:3100/…`.
- Bedienen per `adb shell input tap x y`, den Zustand per `adb exec-out screencap -p` prüfen.
- CDP läuft über `adb forward tcp:9333 localabstract:chrome_devtools_remote` und `chromium.connectOverCDP`.
- Chrome auf dem Emulator hat denselben Chromium-Stand wie die System-WebView (dort 124).

## Was nicht funktioniert hat (und was stattdessen)

| Versuch | Problem | Stattdessen |
|---|---|---|
| Messen auf dem Dev-Server | React Compiler aus, zu viele Renders, falsche Prioritäten | Prod-Build mit `vite preview` |
| Traces mit 4–6x Drossel für Eingabelatenz | Schlafzeit landet bei beliebigen Handlern, die Zuordnung ist falsch | 1x CPU plus Event Timing API; Drossel nur für Long-Task-Zählung |
| Fenster-FPS (react-scan-Overlay) als Kennzahl | zu grob, misst die eigene Last mit | rAF-Deltas: Frames > 33 ms, p95, Long Tasks |
| Code-Audit-Befunde direkt fixen | ca. 1/3 hielt live nicht stand: Reflow pro Move-Event (6x: 0 Long Tasks), Hover-Rahmen klemmt bei Touch (nein), Drag beim Pinch (nur die Auswahl springt) | jeden Befund live reproduzieren, erst dann ein Issue |
| **iOS-Simulator per `cliclick`/Desktop-Maus bedienen** | Das Simulator-Fenster verlor den Fokus, die Klicks landeten im Fenster der Person davor | **Nie die Desktop-Maus übernehmen.** iOS nur per `openurl` plus Screenshot; Tap-Fragen über Chrome-Emulation per CDP oder Android per `adb` (geht nicht über den Desktop) |
| Android-Emulator ohne Fenster für Perf-Zahlen | Er rendert per SwiftShader in Software, die Frames sind wertlos; die synthetischen CDP-Gesten griffen remote nicht zuverlässig | Emulator nur für Funktion; Perf in Chrome mit Drossel |
| Die echte App-WebView lokal testen | `WEB_ORIGIN` ist fest die Produktions-Herkunft, und der Handoff wird beim lokalen API-Server geminted | Bridge per `ReactNativeWebView`-Stub nachstellen; App-WebView nur gegen Produktion, also nicht mit Testdaten |
| playwright-MCP-Browser | wird oft von einer anderen Session belegt („Browser is already in use") | eigenes playwright-core-Skript mit `channel: 'chrome'` |
| `window.scrollBy` für den Zoom-Anker | Der Scroller ist `<main>` bzw. `.canvas-editor-layout__main`, nicht das Fenster | den nächsten Vorfahren mit `overflow-y: auto/scroll` suchen |
| Parallele Builds, `tsc` und Vitest | Der Mac stürzte ab (16 GB) | immer nacheinander; Subagents nur einzelne Testdateien; Typecheck in der CI |

## Fallen beim Messen

- **Testdaten ändern sich.** Drag-Szenarien schreiben über Collab dauerhaft ins Deck. Nach den Tests ist das Test-Deck verschoben. Deshalb pro Messreihe ein eigenes Deck duplizieren und die IDs notieren.
- **Ergebnisse von Remote-Gesten immer prüfen.** Verschiebt sich das Ziel-Element nicht, hat die Geste nicht gegriffen. Das ist dann kein Messwert.
- **Timing-abhängige Befunde gegen master gegenprüfen.** Die Lücke bei „**Risiko** ." unter WebKit trat im Branch nur manchmal auf und auf master ebenso. Ohne den Vergleich wäre sie fälschlich PR #4382 zugeschrieben worden.
- **Zahlen mit 6x Drossel richtig einordnen.** 100–160 ms bei 6x sind etwa 20–30 ms bei 1x. Relevant sind sie erst, wenn sie bei 4x auftreten.
- **`vite preview` ist HTTP/1.1 ohne Kompression.** Ladezeiten über das Netzwerk (LCP 13 s bei „Fast 4G") sind deshalb nicht prod-repräsentativ. Aussagekräftig sind die Zahl der Chunks, die Kette der Abhängigkeiten und die Long Tasks beim Parsen.

## Fixes live belegen (Follow-up-Runde, #4405)

Ein Unit-Test belegt die Logik, aber nicht, dass der Fehler im Browser weg ist. Zweimal fiel erst live auf, dass ein Fix unvollständig war:
- Der Doppelklick-Reset rief `onZoomChange(1)`. React stand aber schon auf 1, die Geste hatte nur die CSS-Variable gesetzt, also passierte nichts.
- Die Fehleransicht hatte einen unsichtbaren Zurück-Button.

**Alt gegen neu nebeneinander:**
- Den alten Build auf einem zweiten Port servieren (`vite preview --outDir <alter-dist> --port 3105`) und jedes Szenario gegen beide laufen lassen.
- Ein Befund gilt erst als behoben, wenn alt den Fehler zeigt und neu nicht.
- Reproduziert alt nicht, misst das Szenario das Falsche. Beispiele:
  - ein falscher Selektor (das Thumbnail einer anderen Seite);
  - ein falsches Element (über die Bühne hinausragend, der Griff liegt außerhalb);
  - eine falsche Request-URL.

**Seltene Zustände gezielt erzwingen statt auf Glück warten:**

| Zustand | Wie |
|---|---|
| Schrift oder Bild kommt spät | `page.route(<url>, async (r) => { await sleep(4000); r.continue(); })`. Vorher `serviceWorkers: 'block'` setzen: Was der Service Worker ausliefert (Fonts, Assets), sieht `route()` nicht. |
| Export über der Bridge-Grenze | Die Antwort von `/api/exports/zip` mit `route.fulfill` durch 10 MB ersetzen. |
| Collab-Zugriff verweigert | `page.routeWebSocket(/\/ws$/)`. Der Collab-Socket läuft über `ws://<origin>/ws`, nicht über :1340. Auf die Auth-Nachricht des Clients mit einem Hocuspocus-Frame antworten: `varString(doc)`, `varUint(2)` (Auth), `varUint(1)` (PermissionDenied), `varString(reason)`. |
| Sitzung lebt bzw. ist tot | `/auth/v2/get-session` mocken. **Im Dev-Bypass liefert die Probe `null`**, ohne Mock gilt jede Sitzung als tot (Logout bzw. `SESSION_LOST`). |
| Wurde neu gemessen? | `CanvasRenderingContext2D.prototype.measureText` zählen und den Aufrufer per Stack bestimmen (`listLayout` = Rich-Text). |

**WebKit/Safari:**
- Mit Playwright-WebKit (`playwright-core/cli.js install webkit`) reproduziert man Safari-Eigenheiten am Mac ohne Simulator.
- Den Kern isoliert prüfen: eine leere Seite der App-Origin mit eigenem `@font-face` und Event-Listenern. So fiel auf, dass **WebKit auf `document.fonts` nie `loadingdone` feuert**, nur `loading`, während `fonts.ready` auflöst (#4400).
- Code, der auf Font-Events hört, braucht in Safari `ready` als zweiten Weg.

## Reviews

- **Inline-Hinweise des Claude Review vor dem Schließen eines PRs prüfen.** Ist ein PR in einem anderen enthalten (#4382 in #4404), gehen offene Hinweise sonst verloren. Von 4 Hinweisen waren 3 noch offen. Sie sind in #4405 behoben und live belegt.
- **Hinweise am Code verifizieren, nicht übernehmen.** „Advisory/plausible" kann schon behoben sein (Rich-Text-Breite per Ref).
- **Der Claude Review bricht bei sehr großen PRs am Zeitlimit ab** (#4404: 100 Dateien, keine Befunde). Lieber mehrere kleinere PRs, oder `@claude /review` mit niedrigerer Stufe erneut anstoßen.
- **CodeQL-Hinweise mitlesen.** Sie kommen als Review-Kommentar von `github-advanced-security`, nicht als roter Check.
- **Gestapelte PRs verknüpfen keine Issues.** `Closes #…` greift nur bei PRs gegen den Default-Branch. Bis der untere PR gemergt ist und die Basis auf master wechselt, von den Issues per Kommentar auf den PR verweisen.
- **Die erste vollständige CI findet, was einzelne Testdateien nicht finden.** Hier waren es Typfehler nur in Testdateien, etwa Casts. Lokal je Paket einmal `tsc` laufen lassen, nacheinander.

## Ergebnisse als Referenz

Prod-Build, Chrome, Deck mit 3 Seiten.

| Szenario | master | nach PR #4382 |
|---|---|---|
| 4 s nach Drag-Ende (4x) | 2 Long Tasks 165–270 ms | 0 |
| Tippen, 28 Zeichen (4x) | 17 Long Tasks, Median-Latenz 80 ms | 0, Median 32 ms |
| Mobil (390×844, DPR 3): Drag, Pinch, Scroll, Resize (4x) | – | 0 Long Tasks, p95 18 ms |
| Mobil bei 6x | – | 1–3 Long Tasks 100–160 ms (Commit bei `touchend`, Thumbnail-Idle-Timeout) |
| Editor öffnen (4x) | – | 13 Long Tasks, die längste 464 ms; 242 Skripte, 3,9 MB JS unkomprimiert |

**Gemessen und bewusst verworfen:**
- Fotos herunterskalieren: 0,88 statt 0,80 ms pro Redraw, Chrome zeichnet auf der GPU.
- Off-Screen-Seiten als Bild: Die Kosten skalieren nicht mit der Seitenzahl, und der Umbau bricht Export und Thumbnails.
- Layer-Split.

**Gefundene Ursachen**, die man ohne Messung nicht vermutet hätte:
- **Autosave-Capture trotz `autoSave={false}`:** PNG mit pixelRatio 2 alle 1,5 s.
- **Radix-Dropdowns in der Thread-Liste:** 2109 Root-`keydown`-Listener kosteten ca. 18 ms pro Taste im Canvas.
- **`cn()` im recharts-Chunk:** 489 KB werden app-weit sofort geladen (#4383).

## Mobil-Checkliste für neue Editor-Features

- Funktioniert es mit Touch allein, ohne Hover und ohne Doppelklick-Garantie?
- Bricht es das Scrollen über den Rand? Auf dem Handy ist das die einzige Scroll-Fläche, der Canvas selbst hat `touch-action: none`.
- Ändert ein zweiter Finger die Auswahl oder den Zustand?
- Sind Trefferflächen ≥ 44 px? Ist ein Text-Eingabefeld ≥ 16 px, damit iOS nicht zoomt?
- Folgt ein über `body` portaliertes Overlay dem Canvas bei Scroll, Zoom und Sheet?
- Im eingebetteten Modus: Gibt es `navigator.share`? In der Android-WebView nicht. Ist der Download kleiner als die Grenze der Bridge (12 MB base64)?
- Zieht ein neuer Import eine schwere Bibliothek statisch in die Canvas-Route? Prüfen über die Importhülle aus dem Build.
