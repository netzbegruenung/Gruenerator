# Mobile-Chat evaluieren: Performance, Scrollen, Rendering

Learnings aus der Evaluation des nativen Chats in `apps/mobile` vom 10.10.2026. Ziel waren 60 fps in jedem Szenario. Das Dokument beschreibt vor allem, **wie** gemessen wurde und **was funktioniert hat und was nicht**.

Ergebnisse:
- **PRs:** #4411 (Markdown-Keys), #4414 (Streaming-Zeile), #4416 (Thread-Position wie ChatGPT), #4418 (Sheets und TTS-Player lazy), #4421 (Compiler-Bailouts im Composer), #4424 (DOM-Props-Emit, Expo-Patch)
- **Offene Issues:** #4419 (React-Compiler-Bailouts), #4426 (eine WKWebView pro Mathe-Formel)

## Kurzfassung: so geht man vor

1. **Kein Dev-Build.** Dev-React und Metro im Dev-Modus verfälschen alles. Ein Production-JS-Bundle reicht für Vergleiche, auch auf einem Debug-Dev-Client.
2. **Commits und Mounts zählen, nicht nur Millisekunden.**
   - Die Zählungen aus einem Commit-Hook sind exakt und reproduzierbar.
   - **Aber: der Hook verfälscht die Zeiten.** Der Fiber-Walk pro Commit kostet bei langen Threads selbst bis zu ~150 ms. Zeiten deshalb ohne Hook messen (nur Frame-Zähler) oder mit dem Hermes-Profiler (siehe unten). Die Mount-Zahlen mit Hook bleiben gültig.
   - Frame-Zeiten streuen im Simulator stark. Jedes Szenario mindestens 2–3-mal laufen lassen, bevor man eine Verbesserung oder Verschlechterung behauptet.
3. **Vor jedem Szenario die App frisch starten.** Sonst landet ein Deep Link im noch offenen Thread, und GC- und Heap-Zustand verschleppen sich.
4. **Den React Compiler nicht als gegeben annehmen.** In Production läuft er mit `panicThreshold: 'NONE'` und überspringt Komponenten stillschweigend (siehe unten).
5. **Baseline auf dem aktuellen master neu messen**, wenn master sich bewegt hat. Der Kaltstart-Block lag auf dem alten master bei 453–505 ms, auf dem neuen bei 283–338 ms. Gegen die alte Zahl hätte PR #4418 doppelt so gut ausgesehen.

## Setup, das funktioniert hat

**Binary:** das vorhandene iOS-Debug-Dev-Client-Binary aus DerivedData. Ein Release-Build war nicht nötig, solange nur JS verglichen wird.

**Bundle:**
```bash
cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:3999/api CI=1 \
  npx expo start --no-dev --minify --port 8099
xcrun simctl openurl <UDID> "exp+gruenerator://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8099"
```
- **Metro nach jeder Änderung neu starten.** Ohne watchman verpasst Metro Änderungen. Danach prüfen, ob das Bundle den neuen Code wirklich enthält.
- **Zum Prüfen dieselbe URL wie die App holen.** Die richtige URL steht im Manifest (`curl -H 'expo-platform: ios' -H 'accept: application/expo+json' localhost:8099`) und enthält unter anderem `transform.reactCompiler=true`. Ohne diesen Parameter liefert Metro ein Bundle **ohne** React Compiler. Daraus habe ich zuerst fälschlich geschlossen, der Compiler laufe gar nicht.

**Zähler:** ein Stub für `__REACT_DEVTOOLS_GLOBAL_HOOK__`, der vor `expo-router/entry` geladen wird. Production-React ruft `onCommitFiberRoot` trotzdem auf.
- Pro Commit wird der Fiber-Baum durchlaufen. Teilbäume ohne Arbeit (`fiber.child === alternate.child`) werden übersprungen.
- **Renders:** Fibers mit PerformedWork-Flag.
- **Host-Mounts:** Tag 5/6 ohne `alternate`.
- **Frames:** rAF-Deltas auf dem JS-Thread, ein Reanimated-Worklet für den UI-Thread.
- Damit Komponentennamen erhalten bleiben, braucht Metro `keep_fnames`.
- **Den Wechsel von `main` in `package.json` und `minifierConfig` nie committen.** Dafür gibt es ein Apply-Skript, das sich wieder entfernen lässt.

**Mock-API** (Node, `ws`):
- Liefert Token-Exchange, Session, Profil, Thread-Liste, Seed-Threads mit 4/50/100/200 Nachrichten (Code, Tabellen, Bilder, Tool-Karten, Mathe, Diagramme) und einen SSE-Stream.
- Der Stream wird über den Nachrichtentext gesteuert, etwa `PERF n=600 ms=25 kind=md|code|math|visual|plain`.
- Login per `gruenerator://auth/callback?code=x`.
- `ws` liegt nicht im Scratchpad-Pfad, deshalb `WS_PATH=<repo>/node_modules/ws`.

**Steuerung:** nur über `xcrun simctl openurl` und Maestro, **nie per Desktop-Maus**, sonst landen die Klicks beim Nutzer.
- Thread öffnen: `gruenerator://chat-conversation?threadId=<uuid>`.
- `initialMessage=…` sendet **nur bei `threadId=new`**. In einen bestehenden Thread sendet man per Maestro: `tapOn id: chat-composer-input`, `inputText`, `tapOn id: chat-composer-send`.

## Hermes-CPU-Profil über CDP

Der Profiler läuft ohne neue Tools über Metros Inspector-Proxy (`/json/list` → `webSocketDebuggerUrl`).
- **Origin-Header ist Pflicht und muss zur Server-Basis passen:** `ws://127.0.0.1:8099/...` mit `origin: 'http://127.0.0.1:8099'`. Ohne Origin gibt es 401, mit `localhost` schließt Expo die Verbindung sofort (1006, `isMatchingOrigin`).
- **`Profiler.start` liefert nur den Root-Knoten.** Stattdessen `Tracing.start` mit `categories: 'disabled-by-default-v8.cpu_profiler'`, nach `Tracing.end` die `ProfileChunk`-Events (`args.data.cpuProfile.nodes/samples`, `timeDeltas`) zu einem `.cpuprofile` zusammensetzen.
- Die Zeilennummern im Profil beziehen sich aufs Bytecode-Bundle (`transform.bytecode=1`), die Source-Map greift nicht. Hermes behält aber die Funktionsnamen, das reicht.
- Auswerten: zusammenhängende Nicht-Idle-Samples als „Block“ (≈ ein JS-Frame), dann Eigenzeit und Aufrufketten pro Block. Eine `(garbage collector)`-Pause wird der Funktion zugeschlagen, in der sie passiert — vor Schlüssen auf eine Bibliothek die Eigenzeit darunter ansehen.

## Fallen

- **Swipes im unteren Bildschirmbereich treffen die offene Tastatur.** Im Listenbereich wischen (z. B. 48 % → 18 %).
- **`hideKeyboard` von Maestro scheitert auf iOS.**
- **SpringBoard startet sich im Simulator manchmal neu** und schickt die App in den Hintergrund. Ein Home-Screen-Screenshot heißt also nicht zwingend, dass die App abgestürzt ist. Prüfen mit `log show --predicate 'process == "SpringBoard"'`.
- **Ein Log, das man mit `: > file` leert, während Node hineinschreibt, enthält NUL-Bytes.** `grep -a` verwenden. BSD-`sed` stirbt daran mit „Assertion failed: (advance > 0)“, das kommt also nicht aus der App.
- **Nach `simctl terminate` hängt der alte WebSocket noch.** Erst messen, wenn wieder 0 Sockets offen sind.
- **DOM-Komponenten (`'use dom'`) bleiben im Debug-Dev-Client mit Production-Bundle leer.** Expo lädt sie dann aus einem eingebetteten `www.bundle`, das nur Release-Builds enthalten. Die JS- und WebView-Erzeugungskosten sind messbar, das Laden von KaTeX nicht, und optisch prüfen lässt es sich nur im Release-Build.
- **Metro mit `CI=1` hat keinen Watcher.** Nach Branch-Wechsel oder Änderung in `node_modules` neu starten.
- **`pnpm patch-commit` (12.8.2) erzeugt ein inkonsistentes Lockfile, wenn das gepatchte Paket Peer anderer Pakete ist** (`expo`): `ERR_PNPM_INCONSISTENT_PATCH_HASH` in CI, lokal erst mit `pnpm install --frozen-lockfile --lockfile-only` sichtbar. Reparatur in #4424 beschrieben.

## React Compiler: stille Bailouts finden

In Production überspringt der Compiler jede Komponente, die er nicht verarbeiten kann, ohne Warnung. Prüfen lässt sich das mit dem Plugin samt Logger, ohne Metro:

```js
babel.transformSync(src, {
  filename, babelrc: false, configFile: false,
  presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
  plugins: [['babel-plugin-react-compiler', { target: '19', panicThreshold: 'none',
    logger: { logEvent: (fn, e) => events.push(e) } }]],
});
// e.kind === 'CompileError' → übersprungen; 'CompileSuccess' → kompiliert
```

Häufige Ursachen und Fixes:
- **`try/finally`, oder `try/catch` mit Bedingungen darin:** den `try` in eine Hilfsfunktion auf Modulebene verschieben.
- **„Existing memoization could not be preserved“:** das manuelle `useMemo`/`useCallback` weglassen. Der Compiler memoisiert selbst.
- **Shared Values von Reanimated:** `.get()`/`.set()` statt `.value` verwenden, sonst meldet der Compiler „This value cannot be modified“.
- **Ein Hook-Rückgabeobjekt, das einen Ref enthält,** und `obj.listRef` im JSX ergibt „Cannot access refs during render“. Lösung: destrukturieren.

Den Erfolg sieht man im Bundle: kompilierte Funktionen beginnen mit `(0,x.c)(N)`.

## Was gewirkt hat (gemessen)

- **Markdown-Keys (#4411):** `react-native-markdown-display` vergibt Keys über einen globalen Zähler, bei jedem Parse neu. Positionsbasierte Keys per pnpm-Patch bringen beim Stream: Host-Mounts 35.081 → 417, `CodeBlock`-Remounts 1.211 → 8, JS-Frames > 33 ms 16 → 4.
- **Streaming-Zeile (#4414):** Die ActionBar wird erst nach dem Stream gemountet, und zwei Compiler-Bailouts sind behoben. Pro Antwort: `Modal`-Renders 1.200 → 10, `BottomSheet` 600 → 0. Die Frame-Zeiten haben sich kaum bewegt.
- **Thread-Position (#4416):** öffnen bei der neuesten Nachricht, mit `initialScrollIndex` und einem Remount, sobald die History da ist.
- **Sheets lazy (#4418):** Ein Sheet mountet erst beim ersten Öffnen. Der Kaltstart-Block sinkt von 283–338 auf 241–255 ms.
- **DOM-Props-Emit (#4424):** Expos DOM-Wrapper schickte die Props im Mount-Effekt an die noch nicht geladene Seite. Jeder Aufruf ist ein synchroner Sprung auf den Main Thread (`findView`). Öffnen des 200er-Threads, alle PRs zusammen: JS-Arbeit 367–420 → 261–262 ms, längster Block 137–172 → 91–123 ms.

## Was nicht funktioniert hat

- **`scrollToBottomOnInitialize` aus `@assistant-ui/react-native` (0.1.44 bis 0.1.47):** Kommt die History erst nach dem Mount, verbraucht der Primitive seinen ausstehenden Scroll mit der Content-Größe der leeren Liste und scrollt auf 0.
- **Ans Ende pinnen ohne `initialScrollIndex`:** Die FlatList beginnt oben und arbeitet sich mit `windowSize` 21 nach unten durch. Beim 200er-Thread ergab das 17.679 Host-Mounts und 20 Frames > 50 ms.
- **`initialScrollIndex` ohne `onScrollToIndexFailed`:** Invariant-Absturz, weil `getItemLayout` fehlt.
- **Liste erst nach `transitionEnd` rendern:** Der UI-Hänger von 154 ms mitten in der Push-Animation verschwindet. Danach kommt aber ein gleich großer Hänger, nur später, und die Nachrichten erscheinen rund 500 ms später (~1,3–1,5 s statt ~0,9 s). Verworfen. Der erste Hänger von ~90 ms entsteht beim Mount des Screens selbst und bleibt ohnehin. Zum Zuordnen braucht man Zeitstempel der langen UI-Frames (Summe der Worklet-Deltas) neben der Commit-Zeitachse.
- **Compiler-Fix im Composer (#4421):** richtig, aber ohne messbaren Effekt aufs Tippen. **Der „teure erste Tastendruck“ (120–175 ms) war ein Artefakt des Commit-Hooks**, er wuchs mit der Thread-Länge, weil der Fiber-Walk das tat. Ohne Hook: längster JS-Frame beim Tippen 25–30 ms, im Hermes-Profil fast keine Arbeit.
- **`maxToRenderPerBatch: 3`:** Beim Hochscrollen wurden Zeilen mehrfach gemountet (bis 512 Zeilen-Mounts für 200 Nachrichten, ein Freeze von 1,6 s). Der Default 10 war besser.

## Offen

- **Hochscrollen durch lange History:** die Hänger sind UI-Thread-Arbeit, keine JS-Arbeit (Profil: kein JS-Block > 8 ms). Hauptursache sind die Mathe-WebViews, eine `WKWebView` pro Formel (#4426): mit Mathe 3–6 UI-Frames > 50 ms (max 79–142 ms), ohne Mathe 1 (max 53–58 ms). Braucht eine Richtungsentscheidung (native Mathe-Darstellung vs. weniger WebViews).
- **Öffnen langer Threads:** nach #4424 bleiben ~45 ms in assistant-ui `useClientLookup` (ein Client pro Nachricht, alle 200, nicht gefenstert) und ~90 ms Screen-Mount.
- **Push in den Thread:** Der Screen-Mount kostet ~100 ms JS und ~90 ms UI, auch beim 4er-Thread. Beim 200er-Thread kommen Zeilen-Mounts mitten in der Animation dazu. Der Hebel sind die Mount-Kosten pro Zeile, nicht das Verschieben der Liste (siehe oben).
- **Stream:** Token-Ticks liegen im 200er-Thread bei ≤ 14 ms JS. Der lange Block beim Absenden (142 ms) ist zu 80 ms eine GC-Pause.
- **Nur auf echtem Gerät zu klären:** UI-Thread-Hitches beim Öffnen der Tastatur.
- **Messwerkzeug:** liegt noch nicht im Repo (geplant unter `apps/mobile/scripts/perf-eval/`).
