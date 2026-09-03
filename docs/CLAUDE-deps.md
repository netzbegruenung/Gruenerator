# Abhängigkeiten: Update- und Sicherheitsstrategie

Stand der Messung: **03.09.2026**. Die Zahlen unten sind Momentaufnahmen und veralten; die Regeln in Teil B nicht. Nachmessen: `gh api 'repos/netzbegruenung/Gruenerator/dependabot/alerts?state=open&per_page=100'`, `pnpm audit --json`, `pnpm outdated -r --format json`, `cd apps/desktop/src-tauri && cargo update --dry-run`.

Die Mechanik der Overrides (vier Ausfallarten, Guards, Familien-Pins) steht in `CLAUDE.md` › *Code Quality* und in `.github/dependabot.yml`; dieses Dokument wiederholt sie nicht, sondern sagt, **wann was in welchem Rhythmus passiert und was liegen bleiben darf**.

---

## Teil A — Lagebild 03.09.2026

### Umfang

| Ebene | Zahl |
|---|---|
| Direkte npm-Abhängigkeiten (alle Workspaces, dedupliziert) | 385 |
| Einträge im `pnpm-lock.yaml` | 7 541 |
| Zeilen in `pnpm.overrides` | 110 (davon ~50 Sicherheits-Floors `>=x`, der Rest Singleton-/Familien-Pins) |
| Crates in `apps/desktop/src-tauri/Cargo.lock` | 566 |
| Python-Pakete `services/nlp` | 5 direkte, **kein Lockfile** |

### Offene Dependabot-Alerts: 16 (7 high, 9 medium) in 7 Paketen

| Paket | Sev. | Wer zieht es | Erreichbar in Prod? | Verfügbarer Fix | Entscheidung |
|---|---|---|---|---|---|
| `qs` 6.15.3 (#530, #531) | medium | `express` 5.2.1 → API und Hocuspocus, dazu MCP-SDK, ts-rest | **Ja** — Query-Parser jeder HTTP-Anfrage | 6.16.0, express erlaubt `^6.14.0` | Override-Floor `>=6.16.0` |
| `fast-uri` 4.1.2 (#522–525, 4 Alerts) | high | `ajv` → MCP-SDK, claude-agent-sdk, commitlint, docusaurus, wp-scripts | Teilweise (MCP-SDK validiert Tool-Schemas im API-Prozess) | 4.1.3 (4.1.4 aktuell) | Override-Floor `>=4.1.3` |
| `brace-expansion` 1.1.16 | high | `minimatch` 3 / `glob` 7 in ~70 Pfaden | Nein (Build-/Test-Werkzeug) | 1.1.18 | Override-Floor `brace-expansion@>=1 <2: >=1.1.18`. **Nur `pnpm audit` sieht es, Dependabot nicht** — die 2.x/5.x-Floors existieren, die 1.x-Linie fehlt |
| `@tiptap/core` 3.29.2 (#526–529) | medium | 17 `@tiptap/*`-Pins + BlockNote 0.54 | **Ja** — `mergeAttributes` verarbeitet HTML-Attribute aus Nutzerinhalten (Docs, Sites, Chat-Artefakte) | 3.30.4 | Familien-Bump aller 17 Override-Zeilen + 3 exakten Manifest-Pins auf `^3.30.4`; Dependabot-PRs #3181/#3182 schließen, sie können das nicht (siehe unten) |
| `@xmldom/xmldom` 0.8.13 + 0.9.10 (#521, #532) | medium | `@expo/plist`, `plist` ← `@expo/config-plugins` ← Expo CLI | Nein (Build-Zeit Mobile) | 0.8.15 / 0.9.12 | Zwei Range-Floors `@xmldom/xmldom@>=0.7 <0.9: >=0.8.15` und `@>=0.9 <1: >=0.9.12` — billig, also mitnehmen |
| `decode-uri-component` 0.2.2 (#520) | medium | `query-string` 7.1.3 ← `expo-router` | Nur Mobile-Bundle, Eingabe sind eigene Deep-Links | 0.5.0 — **ESM-only** (`type: module`), `query-string` 7 ist CJS und fordert `^0.2.2` | **Nicht overriden** (würde Metro-Bundle brechen). Dismiss „Risk is tolerable", Wiedervorlage beim Expo-SDK-58-Upgrade |
| `image-size` 1.2.1 + 2.0.2 (#517, #518) | high | `pptxgenjs` 4.0.1 (API, canvas-editor), `@expo/dom-webview`, Docusaurus, `@assistant-ui/react-native` | API: pptxgenjs misst Bilder, die in PPTX eingebettet werden — Nutzerbilder erreichbar, aber nur JXL/HEIF/ICNS-Parser betroffen | **Keiner** (2.0.2 ist latest, Range `<=2.0.2`) | Dismiss „Risk is tolerable" mit Kommentar „no patch available", **Wiedervorlage monatlich**; falls kein Fix bis Q4: prüfen, ob pptxgenjs die Maße auch aus unserem eigenen `sharp`-Aufruf nehmen kann |
| `extract-zip` 2.0.1 (#519) | high | `@wordpress/scripts` 31 | Nein (Build-Werkzeug WordPress) | **Keiner** | Dismiss „Vulnerable code is not actually used", Wiedervorlage beim Gutenberg-Upgrade |

Ergebnis: **12 von 16 Alerts sind mit fünf Override-Zeilen und einem Familien-Bump geschlossen**, vier werden begründet abgelegt. Das ist ein PR.

### Die beiden offenen Dependabot-PRs zu tiptap zeigen die Grenze des Werkzeugs

#3182 (bump `@tiptap/core` allein) fällt in **allen zwölf** Jobs nach ~15 s: `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`, weil Dependabot `pnpm.overrides` nicht kennt. #3181 (drei Manifeste) fällt im Typecheck, weil `@tiptap/react` 3.30.4 exakt `@tiptap/pm` 3.30.4 verlangt und die 16 Geschwister-Pins bei 3.29.2 stehen. **Beides ist kein schlechter Bump, sondern die erwartete Ausfallart** — jede Familie, die in den Overrides steht, muss von Hand als Ganzes gehoben werden. Solche PRs werden geschlossen, nicht repariert.

### `pnpm outdated`: 156 Pakete hinter latest

- **134 minor/patch.** Auf der Laufzeitseite der API sind das die üblichen Bewegungen: AI-SDK-Provider, LangChain/LangGraph, Langfuse, Sentry, better-auth 1.6.26→1.7.2, Hocuspocus 4.4→4.6, `ai` 7.0.68→7.0.91, axios, multer, nodemailer, pdfjs. Nichts davon ist ein Alert; alles davon gehört in den Monats-Sammel-PR.
- **22 majors**, die in fünf Cluster zerfallen — jeder ist ein eigenes Projekt, keiner ein Dependabot-Merge:

| Cluster | Pakete | Warum blockiert / wer entscheidet |
|---|---|---|
| Lint/TS-Toolchain | `eslint` 9→10, `@eslint/js` 9→10, `typescript` 6→7 | Weiter blockiert: `eslint-plugin-react` peert `<=^9.7`, `typescript-eslint` 8.68 peert `typescript <6.1.0`. Nachgeprüft 03.09.2026 — die `ignore`-Einträge in `dependabot.yml` bleiben richtig |
| Gutenberg | `@wordpress/scripts` 31→34, `components` 32→40, `block-editor` 15→17, `base-styles` 6→13, `sass-loader` 16→17 | `wp-scripts` 34 zieht `eslint ^10` — hängt am Cluster darüber. Ein PR, nach dem eslint-10-Unblock |
| Expo-SDK-Familie | `react-native-gesture-handler` 2→3, `-webview` 13→14, `-pager-view` 8→9, `@react-native-async-storage` 2→3, `@expo/dom-webview` 56→57, `expo-speech-recognition` 56→57, `jest` 29→30, `@types/jest`, `@testing-library/react-native` 13→14 | Nur mit `npx expo install --fix` beim SDK-58-Upgrade. Dependabot ignoriert die Namensräume bewusst |
| Zod 4 | `zod` 3.25→4.5 (api, contracts, ui) | Eigenes Migrationsprojekt; die vier scoped `>zod`-Overrides fallen dann mit |
| Einzelne Libs | `openai` 6→7 (api), `motion` 12→13 (ui, web, wolke), `@tanstack/react-table` 8→9 (web), `react-dropzone` 19→20 (ui, web) | Je ein kleiner, bewusster PR mit Changelog-Lektüre; `react-dropzone` steht als Singleton in den Overrides, also Override mitziehen |

### Cargo (Desktop): die Lane ist still

`cargo update --dry-run` meldet **142 von 566** Crates aktualisierbar. Der letzte Dependabot-Cargo-PR (#1921) wurde am **24.07.2026** gemerged; seither **kein einziger**, obwohl `dependabot.yml` wöchentlich freitags vorsieht. Kein offener Cargo-Alert, aber `cargo-audit` ist lokal nicht installiert und läuft in keiner CI-Lane. Ungeprüft: warum die Lane schweigt — das Dependabot-Job-Log unter *Insights → Dependency graph → Dependabot* ist der einzige Ort, wo es steht.

### Abdeckungslücken (was heute niemand ansieht)

| Lücke | Befund | Folge |
|---|---|---|
| **Python `services/nlp`** | `pyproject.toml` mit `>=`-Floors, kein Lockfile, `pip install .` im Dockerfile, kein `pip`-Eintrag in `dependabot.yml` | Jeder Image-Build zieht andere Versionen; kein Alert erreicht uns |
| **Docker-Basisimages** | `node:22-slim`/`-alpine`, `python:3.12-slim`; kein `docker`-Eintrag in `dependabot.yml`; `build-images.yml` läuft nur bei Push | Patch-Releases des Basisimages kommen nur mit dem nächsten Code-Push in Prod |
| **GitHub Actions** | 0 von ~140 `uses:` per SHA gepinnt, alle auf Major-Tags (`actions/checkout@v7`) | Ein kompromittiertes Tag (Vorbild: `tj-actions/changed-files`, März 2025) läuft mit `contents: write` |
| **`pnpm audit` in CI** | Läuft nirgends | Der `brace-expansion`-Fall oben: Dependabot sieht die Lücke nicht, `pnpm audit` schon |
| **pnpm-Version** | `packageManager: pnpm@10.0.0` (Januar 2025), aktuell 10.34.5 / 11.25 | Kein `minimumReleaseAge` (ab 10.16), keine `trustPolicy`; wir installieren jede Version am Tag ihres Erscheinens |
| **Alert-Ablage** | Alle bisherigen 516 Alerts wurden als `fixed` geschlossen, keiner je als `dismissed` | Alerts ohne Fix (`image-size`, `extract-zip`) bleiben als „offen" stehen und verwässern die Zahl |

Was **funktioniert** und bleibt: Secret Scanning + Push Protection an, GitGuardian als Check, CodeQL auf PRs, die drei Override-Guards im `Guards`-Job, `--frozen-lockfile`, das Auto-Approve für patch/minor.

---

## Teil B — Strategie

### B1. Drei Klassen, drei Uhren

| Klasse | Auslöser | Frist | Form |
|---|---|---|---|
| **Sicherheit** | Dependabot-Alert oder `pnpm audit` high/critical | high/critical: **72 h** bis PR offen; medium: **7 Tage**; low: nächster Monats-PR | Ein PR `chore(deps): close open Dependabot alerts (<datum>)`, fast immer Override-Floors. Verlinkt keine Issues, aber listet die GHSA-IDs im Body |
| **Routine** | Dependabot `minor-patch`-Gruppe montags | **Monatlich** ein Sammelbranch (erster Werktag), nicht wöchentlich | `package.json`-Änderungen der Dependabot-PRs übernehmen, Lockfile **einmal** regenerieren, Dependabot-PRs schließen. Der Web-Build ist Pflichtgate, nicht nur Typecheck (Memory: `[MISSING_EXPORT]` sieht nur der Bundler) |
| **Major** | Cluster-Tabelle oben | **Quartalsweise** entscheiden, was das nächste Projekt ist; nie mehr als eines gleichzeitig | Eigener Branch, eigenes Issue mit Blocker-Stand, Changelog gelesen, Live-Eval für alles, was ein Modell berührt |

Warum nicht schneller bei Routine: die Erfahrung der letzten acht Wochen (151 Commits an `package.json`/Lockfile, drei CI-Ausfälle allein durch Override-Drift, #2974/#2809/#2725) sagt, dass **jeder** Lockfile-Regenerationslauf Risiko trägt. Ein Lauf im Monat mit vollem Gate ist billiger als vier halbe.

### B2. Exposure-Triage: welche Alerts überhaupt zählen

Bevor ein Alert eine Frist bekommt, wird er eingeordnet. Die Frage ist nicht „welche Severity", sondern **„welcher Prozess lädt den Code, und wer liefert die Eingabe"**:

1. **Server-Laufzeit** (API, Hocuspocus, MCP): immer fixen, Frist nach Severity.
2. **Client-Bundle** (Web, Mobile): fixen, wenn der verwundbare Pfad fremde Eingabe sieht (HTML anderer Nutzer, geteilte Dokumente, Deep-Links von außen). Sonst Klasse Routine.
3. **Nur Build-/Test-Werkzeug** (wp-scripts, Expo CLI, jest-expo, Docusaurus, commitlint): fixen, wenn es ein Override-Floor ist (eine Zeile); sonst **dismiss** mit Grund `Vulnerable code is not actually used` und dem Pfad im Kommentar.
4. **Kein Patch verfügbar**: dismiss `Risk is tolerable to this project` (GitHub kennt keinen Grund „kein Patch" — der steht im Kommentar), **Wiedervorlage im Monats-PR** (Dependabot öffnet den Alert bei neuem Patch nicht automatisch wieder — `gh api .../dependabot/alerts?state=dismissed` gehört deshalb in die Monatsroutine).

`pnpm why -r <paket> --prod` gegen `@gruenerator/api` beantwortet Frage 1; Dependabots `scope: runtime` tut es **nicht** — es beschreibt die Deklaration in der Kette, nicht unseren Prozess (`extract-zip` steht als `runtime`, ist aber reines Build-Werkzeug).

### B3. Dismiss ist eine Entscheidung mit Datum, kein Wegschauen

Ein Dismiss trägt immer: Grund aus GitHubs Liste, den `pnpm why`-Pfad, und wann neu geprüft wird. Beispiel für `image-size`: *„Tolerable risk, no patch available — pptxgenjs 4.0.1 → image-size 1.2.1, JXL/HEIF/ICNS-Parser; Nutzerbilder erreichen pptxgenjs als PNG/JPEG aus sharp. Re-check 01.10.2026."* Dismissed-Alerts werden monatlich gelistet; einer, der einen Patch bekommen hat, wandert in Klasse Sicherheit.

### B4. Override-Floors sind das Werkzeug für Transitives — mit drei Regeln

Der Bestand von 110 Zeilen ist kein Problem, solange jede Zeile eine von zwei Rollen hat: **Sicherheits-Floor** (`>=x`, offen nach oben) oder **Singleton-/Familien-Pin** (Caret oder exakt, mit Grund in `DELIBERATE` bzw. `check-singleton-versions.mjs`).

1. **Floor mit Range-Selektor, wenn mehrere Major-Linien im Baum sind** (`brace-expansion@>=1 <2`, `@xmldom/xmldom@>=0.9 <1`). Ein nackter Floor `>=1.1.18` würde die 2.x- und 5.x-Linie auf 1.x zurückzwingen.
2. **Floor nie über den vom Abhängigen deklarierten Bereich hinaus** — `pnpm overrides:ranges` prüft es, aber erst nach dem Install. Vorher `npm view <abhängiger>@<version> dependencies.<paket>` lesen (hier: express erlaubt `qs ^6.14.0`, also ist `>=6.16.0` sicher).
3. **Floors, die ihren Zweck erfüllt haben, bleiben stehen.** Ein Floor kostet nichts; ihn zu entfernen kann eine gepatchte Version zurückdrehen, sobald ein Abhängiger seinen Caret senkt. Aufräumen nur, wenn das Paket ganz aus dem Baum ist (`pnpm why -r` leer).

Familien (`@tiptap/*` 17, `@assistant-ui/*` 6, `@blocknote/*` 6): **eine** Version für alle Zeilen, ein Commit, Manifeste mit exaktem Pin (`packages/contracts`, `sites`, `sites-design`) mitziehen. Dependabot-PRs, die ein Familienmitglied allein heben, werden geschlossen — mit dem Kommentar „superseded by family bump in #…", damit Dependabot den Bump nicht wieder öffnet.

### B5. Abdeckung schließen (einmalige Einrichtung, in dieser Reihenfolge)

1. **`pnpm audit --prod --audit-level high` im `Guards`-Job.** Läuft in Sekunden, braucht kein `node_modules`, fängt die Fälle, die Dependabot nicht meldet. Bewusste Ausnahmen über `pnpm.auditConfig.ignoreGhsas` in `package.json` (gilt für pnpm 10; ab 11.16 wandert es als `audit`-Abschnitt nach `pnpm-workspace.yaml`) — mit demselben Kommentar wie ein Dismiss (Grund, Pfad, Datum). Blockierend nur für `high`/`critical`; `moderate` wird gemeldet.
2. **`services/nlp` bekommt ein Lockfile und einen Dependabot-Eintrag.** `uv lock` → `uv.lock`, Dockerfile auf `uv sync --frozen`, `package-ecosystem: pip, directory: /services/nlp`, wöchentlich. Ohne Lockfile ist der Eintrag wertlos (Dependabot kann nur bumpen, was es festhalten kann).
3. **`package-ecosystem: docker`** für die fünf Dockerfiles (api, web, hocuspocus, gruen-o-mat, documentation) plus `services/nlp`. Gruppieren; Major-Bumps (`node:24`) per `ignore` blocken, bis das Node-24-Projekt ansteht (Node 22 EOL **30.04.2027** — spätestens Q1 2027 planen).
4. **`build-images.yml` bekommt einen wöchentlichen `schedule`** (z. B. Sonntag 03:00) zusätzlich zum Push-Trigger, damit Basisimage-Patches ohne Code-Push nach Prod kommen. Watchtower auf Test zieht es ohnehin; Prod-Deploy bleibt manuell.
5. **GitHub Actions per SHA pinnen** (`uses: actions/checkout@<sha> # v7.0.0`). Dependabot hält SHA und Kommentar zusammen aktuell; die `actions`-Gruppe existiert schon. Reihenfolge: erst die Workflows mit `contents: write` / `pull-requests: write` (`dependabot-auto-merge.yml`, `build-images.yml`, `desktop-release.yml`, die vier `docs-*`).
6. **Cargo-Lane wiederbeleben:** Dependabot-Log prüfen, dann `cargo update` als eigener PR mit Desktop-Build (immer von `master`, siehe CLAUDE.md › Desktop). `cargo audit` als Schritt in `desktop-weekly.yml`.

### B6. pnpm heben, dann Lieferketten-Schalter setzen

`pnpm@10.0.0` → **`10.34.5`** (letzte 10er-Linie; 11 ist ein eigener, kleiner Folgeschritt, erst wenn 10.34 zwei Wochen ohne Befund lief). Danach in `pnpm-workspace.yaml`:

- `minimumReleaseAge: 10080` (7 Tage; pnpm 11 setzt 1440 als Default, 10.x gar nichts) — schließt das Fenster, in dem kompromittierte Versionen typischerweise erkannt und zurückgezogen werden (Shai-Hulud/`chalk`-Vorfälle 2025 lagen jeweils unter 48 h). Ausnahmeliste `minimumReleaseAgeExclude` für unsere eigenen Hotfix-Pfade (`@assistant-ui/*`, `@blocknote/*`), wenn ein Bugfix nicht warten kann.
- `onlyBuiltDependencies` **explizit** auflisten (heute leer, `ignoredBuilds: []` — also läuft aktuell kein Install-Script; wer eines braucht, trägt es ein).
- `trustPolicy: no-downgrade` (ab pnpm 10.21): Install bricht ab, wenn eine neue Version eines Pakets ein **niedrigeres Vertrauensniveau** hat als die vorige (z. B. Wechsel von Trusted Publishing zurück auf ein Token) — genau das Muster übernommener Maintainer-Konten. Ausnahmen über `trustPolicyExclude`.

Dependabot-seitig ergänzend: `cooldown: { default-days: 7 }` auf dem npm-Eintrag — dieselbe Idee auf der PR-Seite, damit Dependabot keine Version vorschlägt, die pnpm dann verweigert.

### B7. Rituale

| Rhythmus | Wer | Was | Nachweis |
|---|---|---|---|
| **Montag** (Dependabot-Tag) | Agent/Mensch, 20 min | Alerts triagieren (B2), Sicherheits-PR öffnen, Familien-PRs schließen | Alert-Zahl im PR-Body, `pnpm audit` grün |
| **Erster Werktag im Monat** | Agent, 2 h | Sammelbranch Routine (B1), `pnpm outdated`, `cargo update`, `npx expo install --check`, dismissed-Alerts nachsehen (B3/B4), Docker-Basisimages | PR-Body mit `outdated`-Delta vorher/nachher |
| **Quartal** | Mensch entscheidet | Nächstes Major-Projekt aus der Cluster-Tabelle, Blocker neu prüfen (`npm view … peerDependencies`), Node-/Python-EOL-Kalender | Issue pro Projekt |

### B8. Was ausdrücklich **nicht** Teil der Strategie ist

- **Kein Auto-Merge.** Der Grund steht in `dependabot-auto-merge.yml`: `allow_auto_merge` ist aus, Squash ist verboten, und jeder Override-PR bricht ohnehin. Auto-Approve bleibt.
- **Kein wöchentliches `pnpm update -r`.** Es hebt Floors, dreht Familien auseinander und ist der Weg in die vier Ausfallarten.
- **Kein Bundle-Scanner als Dritter** (Snyk/Socket). Dependabot + `pnpm audit` + CodeQL + GitGuardian decken den Bedarf; ein weiterer Dienst produziert eine dritte Alert-Liste ohne dritte Wahrheit.
- **Kein globaler Override für `zod` 4 / `react`** — beide sind bewusst dokumentierte Ausnahmen (`CLAUDE.md` › Expo Apps, `dependabot.yml`).

---

## Sofortmaßnahmen (die nächsten drei PRs — Stand 03.09.2026: #3185 Alerts, #3187 Deckung, #3186 pnpm; #517–#520 sind mit Grund und Datum dismissed)

1. **`chore(deps): close open Dependabot alerts (2026-09-03)`** — fünf Override-Floors (`qs`, `fast-uri`, `brace-expansion@>=1 <2`, zwei `@xmldom/xmldom`-Ranges), Familien-Bump `@tiptap/*` auf `^3.30.4` (17 Overrides + 3 Manifeste), `pnpm install --lockfile-only`, Web-Build lokal. Dismiss von #517, #518, #519, #520 mit Kommentar nach B3. Schließt #3181 und #3182. Erwartung: 16 → 0 offene Alerts, 4 dismissed.
2. **`chore(ci): audit gate, pip and docker coverage`** — B5 Punkte 1–4 in einem PR (nur Config, kein Lockfile-Risiko).
3. **`chore(deps): pnpm 10.34.5 with minimumReleaseAge`** — B6. Eigener PR, weil die Lockfile-Regeneration mit neuem pnpm das einzige Risiko trägt; Guards + Web-Build + `pnpm test` als Gate.

Der Cargo-Befund und die Actions-SHA-Pins folgen als vierter und fünfter PR, sobald das Dependabot-Log gelesen ist.
