# Barrierefreiheit — was die Umsetzung nicht auflösen konnte

Gegenstück zu [barrierefreiheit-umsetzungsplan.md](barrierefreiheit-umsetzungsplan.md).
Hier steht, was bei der Umsetzung von PR A/B/C **liegen geblieben ist** — und warum
jeder Punkt eine Entscheidung braucht statt eines weiteren Commits.

Alle Kontrastwerte sind mit der WCAG-Formel gerechnet (sRGB-Relativluminanz),
nicht geschätzt.

## Stand nach der Umsetzung (Nachmessung 02.08.2026)

axe-core über 20 Routen, **hell und dunkel**, mit aktivem Dev-Auth-Bypass:

| Regel | Baseline | jetzt |
| --- | --- | --- |
| `nested-interactive` | 315 | **0** |
| `button-name` | 9 | **0** |
| `aria-allowed-attr` | 3 | **0** |
| `link-name` | 0 | 0 |
| `color-contrast` | ~455 | **45** |

Die verbleibenden 45 gehen auf **vier** Farbpaare zurück:

| Paar | Ist | Wo |
| --- | --- | --- |
| `#ffffff` auf `#5f8575` | 4,11 | Sprung-Link, `button variant="brand"` — **§1** |
| `#8ac9b0` auf `#525252` | 4,11 | Agentura-/Agenten-Karten im Dunkelmodus — **§1** |
| `#497b69` auf `#262626` | 3,11 | Textlinks auf der dunklen Hälfte der Loginseite |
| ~~`#316049` auf `#3a3a3a`~~ | ~~1,57~~ | ~~„404"-Riesenziffer~~ — behoben, siehe unten |

Die ersten beiden sind §1 — die offene Designentscheidung. Der dritte ist ein
eigenständiger Befund, aber auf einer Seite, deren Farbgebung ohnehin mit §1
zusammen entschieden werden sollte.

Die „404"-Riesenziffer ist inzwischen behoben: sie steht im Dunkelmodus auf
`--primary-300` (5,99:1) statt auf dem Marken-Grün. Der Hellmodus war mit 6,70:1
nie betroffen — das ist der Grund, warum ein pauschales Abdunkeln der Rampe
falsch gewesen wäre und nur die Dunkelfassung überschrieben wurde.

**Eine Nebenwirkung, die benannt gehört:** Der Sprung-Link steht jetzt per
Vorgabe an (WCAG 2.4.1 ist Level A) und benutzt `--secondary-600`. Damit trägt
er den Markenfarben-Befund auf **jede** Route — vorher war er auf drei Routen
sichtbar. Das ist keine Verschlechterung, sondern derselbe Defekt an einer
Stelle, die jetzt überall auffällt. Er verschwindet mit §1 auf einen Schlag.

### Zwei Messfallen, die dabei aufgefallen sind

- **Ohne Bypass misst man 20× die Loginseite.** Der erste Nachmesslauf meldete
  einen Traumwert, weil jede Route auf `/login` umleitete. Ursache: der
  Origin-Rewrite im Vite-Dev-Proxy hängt an der Umgebungsvariablen
  `VITE_DEV_PORT` (ein `--port`-Flag genügt **nicht**), und
  `VITE_E2E_AUTH_BYPASS` muss im `process.env` stehen, nicht nur in der `.env`.
  Die Messskripte prüfen jetzt auf Login-Umleitung und melden sie als Fehler
  statt als Erfolg.
- **`/documents` war keine Route.** Die Anwendung kennt nur
  `/documents/:documentId`; die Lane hat dort die Nicht-gefunden-Seite geprüft
  und als Dokumentenübersicht ausgegeben — der einzige Grund, warum die
  404-Riesenziffer oben überhaupt in der Messung auftauchte. Der Eintrag ist
  raus (die Übersicht ist `/office` und stand ohnehin schon drin), und
  `gotoAuthenticated()` bricht jetzt ab, wenn eine Route auf `/login` umleitet
  **oder** die Nicht-gefunden-Seite rendert. Beide Riegel prüfen dieselbe
  Fehlerklasse: eine Messung, die etwas anderes prüft als die genannte Route,
  sieht erfreulich aus und sagt nichts.

---

## 1. Markenfarben: Weiß auf Eukalyptus erreicht 4,5:1 nicht

**Das ist die eine blockierende Designentscheidung.** Sie war schon im
Umsetzungsplan als §0 benannt und ist weiterhin offen — sie gehört nicht der
Entwicklung.

| Token | Farbe | Weiß darauf | Nötig | Wo |
| --- | --- | --- | --- | --- |
| `--secondary-500` | `#6A9583` | **3,37:1** | 4,5:1 | `badge variant="secondary"` (20 Fundstellen) |
| `--secondary-600` | `#5F8575` | **4,12:1** | 4,5:1 | `button variant="brand"` (45 Fundstellen) |

`badge variant="secondary"` bezieht seinen Grund über `--color-secondary`, das in
[index.css:311](../apps/web/src/assets/styles/index.css#L311) auf `--secondary-500` zeigt;
`button variant="brand"` steht direkt auf `bg-secondary-600 text-white`
([button.tsx:20](../packages/ui/src/components/button.tsx#L20)).

### Warum „dann eben dunkler Text" nicht funktioniert

Nachgemessen, nicht angenommen: das dunkelste Marken-Grün als Textfarbe auf
`--secondary-500` ergibt **4,02:1** (`#1a332a` auf `#6A9583`) — ebenfalls durchgefallen.
Der Farbwechsel allein löst es also nicht, der Grund muss so oder so bewegt werden.

### Drei Auflösungen, mit gerechneten Werten

1. **Abdunkeln (empfohlen).** `--secondary-600` auf `#587C6D` → **4,65:1**, und
   `--color-secondary` (Badge-Grund) von `--secondary-500` auf `--secondary-600`
   umhängen. Löst beide Fälle auf einmal, verschiebt den Markenton minimal
   (Δ ≈ 4 % Helligkeit).
2. **Schrift vergrößern/fetten.** Bei „großem Text" (≥ 18,5 px, oder ≥ 14 px fett)
   genügt 3:1 — beide Werte lägen dann drüber. Badges sind heute 12 px normal;
   das wäre eine sichtbare Umgestaltung, keine Farbkorrektur.
3. **Nur den Badge-Grund abdunkeln** und den Brand-Button auf `#597E6E` (4,53:1)
   ziehen. Kleinster Eingriff, aber zwei Grünstufen, die sich nur um einen Hauch
   unterscheiden — pflegeanfällig.

**Solange nichts entschieden ist,** bleibt `color-contrast` auf allen geprüften
Routen in der Ausnahmeliste `KNOWN_VIOLATIONS` stehen — der Sprung-Link trägt den
Befund seit Welle 3 überallhin.

---

## 2. Die Grau-Rampe trägt keinen Text am hellen Ende

Behoben ist `--grey-500`: es ist jetzt themeabhängig (`--grey-text-val`, hell
`#6d6d6d`, dunkel `#909090`) und erreicht in **beiden** Modi 4,5:1. Vorher
erreichte es in **keinem** — hell 4,17:1, dunkel 3,63:1 auf `#262626`. Der
naheliegende Fix aus dem Plan („auf `#767676` abdunkeln") hätte den Dunkelmodus
verschlechtert; der Befund dahinter ist, dass `text-grey-500` als Utility-Klasse
im Markup steht und **nicht** über ein themeabhängiges Semantik-Token läuft.

**Offen ist `--grey-400`.** `#989898` erreicht auf Weiß nur **2,88:1**. Der
Bestand:

| Schreibweise | Fundstellen | Modus | Bewertung |
| --- | --- | --- | --- |
| `dark:text-grey-400` | 216 | nur dunkel | 5,25:1 — **in Ordnung** |
| `text-grey-400` | 424 | beide | 2,88:1 hell — **durchgefallen** |

Warum axe davon nur **eine** Fundstelle gemeldet hat: die Lane prüft
Einstiegsseiten, und die unpräfigierten Vorkommen liegen überwiegend in
Komponenten, die dort nicht gerendert werden. Die Zahl ist also nicht klein,
sie ist nur nicht gemessen.

**Warum das nicht mitrepariert wurde:** Damit `text-grey-400` hell 4,5:1
erreicht, müsste es auf ≈ `#6d6d6d` — denselben Wert wie `grey-500`. Die Stufen
400 und 500 fallen dann im Hellmodus visuell zusammen, und der Sprung von
`grey-300` (`#bdbdbd`) auf `grey-400` wird zum Bruch. Das ist eine Entscheidung
über die Rampe, keine Zahlenkorrektur.

Zwei saubere Wege, beide brauchen eine Designzusage:

- **Rampe stauchen** — `--grey-400` ebenfalls themeabhängig machen und im
  Hellmodus mit `grey-500` zusammenlegen. Ein Commit, kollabiert aber die Hierarchie.
- **Aufrufstellen migrieren** — die 424 unpräfigierten `text-grey-400` auf das
  bereits vorhandene, themeabhängige `text-muted-foreground` umstellen
  (hell `#666666` = 5,74:1, dunkel `#999999` = 5,31:1). Sauberer, aber 424
  Fundstellen einzeln zu beurteilen: nicht jede davon ist Fließtext.

`--grey-300` (`#bdbdbd`, 1,88:1 auf Weiß, 99 Fundstellen als Text) wurde bewusst
gar nicht angefasst — es steht überwiegend auf dunklen Flächen, eine pauschale
Abdunklung würde dort das Gegenteil bewirken. Braucht eine Einzelprüfung.

---

## 3. `/boards`: `nested-interactive` hängt an dnd-kit, nicht an unseren Karten

> **Nachtrag:** in einem eigenen PR aufgelöst — Ziehgriff statt ziehbarer Karte,
> abgesichert per Komponententest, weil ein leeres Board in der Lane gar keinen
> Wrapper rendert. Der Eintrag in `KNOWN_VIOLATIONS` bleibt bis zum festen
> Datenstand (§6) trotzdem stehen. Der folgende Abschnitt beschreibt den Befund,
> wie er vorgefunden wurde.

Der schwerste Einzelposten der Baseline (315 Vorkommen) war auf `/boards`
zunächst **nicht behoben** — und zwar aus einem belegten Grund, nicht aus
Zeitmangel.

`useSortable`/`useDraggable` setzen auf das Wrapper-Element per Vorgabe
`role="button"` und `tabIndex={0}`
(`node_modules/@dnd-kit/core/dist/core.cjs.development.js:3382`: `const defaultRole = 'button';`).
Betroffen sind die geteilten Wrapper
[kanban/index.tsx:181](../apps/web/src/components/kibo-ui/kanban/index.tsx#L181) und
[list/index.tsx:107](../apps/web/src/components/kibo-ui/list/index.tsx#L107).

Damit ist der **Vorfahr** jeder Aufgabenkarte bereits ein interaktives Element.
Egal was in `CardContent.tsx`/`BoardListView.tsx` steht — auch eine saubere
Umstellung auf `InteractiveCard` — axe meldet die Verschachtelung weiterhin am
äußeren Wrapper. Die beiden Dateien wurden deshalb **unverändert gelassen**.

Es ist auch nicht mit einem Attribut getan: der Enter/Space-Handler des äußeren
`role="button"` ist von dnd-kits `KeyboardSensor` fürs Aufnehmen der Karte
belegt. Ein zusätzliches Bedienelement „Karte öffnen" darin erzeugt entweder
einen zweiten Tabstopp (wieder `nested-interactive`) oder einen Tastenkonflikt.

**Die Auflösung ist ein Ziehgriff.** Das Muster existiert im Repo bereits für
Spalten (`KanbanColumnDragHandle`): Ziehen ausschließlich über einen dedizierten
Griff, `useSortable` mit `attributes: { role: 'group' }`, danach ist die Karte
selbst frei für `InteractiveCard`. Das ist eine Interaktionsänderung mit
sichtbarer Wirkung auf die Bedienung — eigener PR, eigene Abnahme.

Bis dahin bleibt `nested-interactive` für `/boards` in der Ausnahmeliste — und
zwar **bewusst, obwohl die Nachmessung dort nichts meldet**: der Messlauf hatte
ein leeres Board (0 Karten), also rendert der dnd-Wrapper gar nicht. Ein
Nicht-Befund ohne Daten ist kein Beleg. Genau deshalb ist der feste Datenstand
(§6) die Vorbedingung dafür, diesen Eintrag je zu streichen.

---

## 4. `media-has-caption` (5) — Inhaltsarbeit, kein Markup

| Datei |
| --- |
| `features/shared-media/SharedMediaPage.tsx` |
| `features/subtitler-beta/components/BetaVideoPlayer.tsx` |
| `features/subtitler/components/SharedVideoPage.tsx` |
| `features/subtitler/components/SubtitleEditor.tsx` |
| `features/subtitler/components/VideoSuccessScreen.tsx` |

Ein `<track kind="captions">` ohne Datei dahinter erfüllt **WCAG 1.2.2 nicht** —
er täuscht Konformität vor. Die Videos hier sind nutzergenerierte Uploads bzw.
Vorschauen im Untertitel-Werkzeug; die Untertitelspur müsste aus dem bereits
vorhandenen Transkript erzeugt und mitgeliefert werden. Das ist eine
Produktentscheidung über den Untertitel-Fluss, kein Attribut.

Eigenes Ticket. Die ESLint-Regel bleibt solange auf `warn`.

---

## 5. `no-autofocus` (24) — Inventar, kein Verstoß

Bewusst **nicht** abgeräumt. In Dialogen ist Autofokus richtig, und Radix setzt
ihn ohnehin selbst; ein pauschales Entfernen würde die Bedienung verschlechtern,
nicht verbessern. Die Regel bleibt auf `warn` und dient als Inventar.

Wer sie später durchgeht, prüft je Fundstelle **eine** Frage: Erscheint das
Element als Reaktion auf eine Nutzerhandlung (Dialog, Bearbeitungsfeld)? Dann
bleibt der Autofokus. Steht es beim Laden der Seite schon da? Dann muss er weg —
ein Fokussprung ohne Auslöser ist für Screenreader-Nutzende ein Kontextwechsel
ohne Ankündigung (WCAG 3.2.1).

---

## 6. Was die Lane weiterhin nicht misst

### Zuerst: in CI misst sie überhaupt nichts

Der Check „axe-core (WCAG 2.2 AA)" ist auf jedem Frontend-PR grün und hat noch
nie etwas geprüft — `Running 22 tests using 4 workers` / `22 skipped`. Die Suite
skippt korrekt, wenn der Dev-Auth-Bypass nicht greift; sie greift in CI nur nie:
das Secret `DEV_AUTH_BYPASS_TOKEN` ist leer, **und** der Workflow startet kein
Backend, das `isDevBypassHonored()` auf `localhost:3001` erreichen könnte.

Sichtbar gemacht ist das in einem eigenen PR (Zählwerk + Annotation, ohne den
Job rot zu färben). Behoben ist es damit nicht. Dafür braucht es eine
Entscheidung zwischen zwei Wegen:

- **Backend in CI** — Postgres/Redis als Service-Container plus API mit
  `ALLOW_DEV_AUTH_BYPASS=true`, dazu das Secret. Misst die echte Anwendung, ist
  aber der aufwendigere Weg; im Repo gibt es bisher keinen Workflow mit
  Service-Containern.
- **API abfangen** — Antworten per `page.route()` aus Fixtures. Braucht kein
  Backend und liefert denselben festen Datenstand, den der nächste Punkt
  ohnehin verlangt. Deshalb der bessere Kandidat.

### Und dann die beiden Punkte aus dem Umsetzungsplan

Diese beiden Punkte (B4, B5) sind **nicht angefasst**, weil sie das Prüfmittel
selbst ändern:

- **Fester Datenstand (Seed oder MSW).** Ohne ihn rendert `/boards`
  datenabhängig — zwei Läufe derselben Fassung ergaben in der Baseline 782 vs.
  834 Vorkommen. Deshalb prüft die Lane heute **welche** Regeln verletzt werden,
  nicht **wie viele** Fundstellen. Vor der Scharfstellung als Required Check
  muss der Datenstand fixiert werden.
- **Zustände statt nur Einstiegsseiten.** Geöffneter Dialog, Formular im
  Fehlerzustand, Chat während des Streamings. Genau dort sitzen Fokusführung und
  `aria-live` — und genau die kann die heutige Lane nicht sehen. Deshalb wurde
  **B5 (`aria-live`) nicht umgesetzt**: ohne B4.2 wäre jede Statusmeldung
  behauptet, nicht belegt. `announceToScreenReader()` steht bereit in
  [accessibilityHelpers.ts](../apps/web/src/components/utils/accessibilityHelpers.ts)
  und wird weiterhin kaum benutzt (11 `aria-live` im gesamten Frontend).

---

## 7. Zwei Dinge, die außerhalb des Codes liegen

- **Fällt der Grünerator unter BFSG/BaFG?** Rechtsfrage, weiterhin offen. Davon
  hängt ab, ob die geplante Doku-Seite eine Erklärung zur Barrierefreiheit im
  Rechtssinn ist oder eine freiwillige Selbstauskunft. Eine falsche
  Konformitätsaussage ist schlechter als keine.
- **Automatik deckt 30–40 % ab.** Auch eine vollständig grüne Lane ist kein
  Konformitätsnachweis. Der manuelle Durchlauf (Tastatur-only, NVDA/VoiceOver)
  steht weiterhin aus — er ist in Welle 5 des Gesamtplans verortet.

---

## 8. Nicht gemessene Bereiche

Die Lane prüft 20 Routen der Web-App. **Nicht** gemessen und damit ohne Aussage:

- **Die Expo-App.** PR C hat 295 fehlende Bedienelement-Namen behoben, geprüft
  per ESLint (`react-native-a11y`). Ein statischer Linter ist aber kein
  Laufzeit-Audit: Kontrast, Fokusreihenfolge und Ansagen von VoiceOver/TalkBack
  sind damit nicht geprüft. Für React Native gibt es keine axe-Entsprechung —
  hier hilft nur ein Gerätedurchlauf.
- **Die Desktop-App** (Tauri-Hülle um dieselbe Web-Oberfläche) — erbt die
  Web-Befunde, hat aber eigene Fenster-Chrome-Elemente.
- **`packages/sites`** (die veröffentlichten Kandidat:innen-Seiten) und
  **`documentation/`** — eigene Auslieferung, eigene Routen, nie gemessen.
