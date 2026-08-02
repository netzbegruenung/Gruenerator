# Barrierefreiheit — Baseline-Messung 02.08.2026

Erhoben mit `@axe-core/playwright` 4.12.1 (axe-core 4.12) gegen den lokalen Dev-Server,
angemeldet über den Dev-Auth-Bypass, Chromium 1228, Viewport 1280×900.
Regelsatz: `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa` — **ohne** `best-practice`
(das sind Deque-Empfehlungen ohne Normbezug; sie in dieselbe Liste zu werfen macht
den Unterschied zwischen Normverstoß und Geschmacksfrage unsichtbar).

20 Routen × 3 Darstellungsmodi (hell / dunkel / `forced-colors: active`).

Plan und Zielstandard: [barrierefreiheit-audit-plan.md](barrierefreiheit-audit-plan.md)

---

## 1. Ergebnis

| | Vorkommen | Regeln | saubere Routen |
| --- | --- | --- | --- |
| Erstmessung | **1027** | 5 | 0 / 20 |
| Nach dem Sidebar-Fix (siehe §3) | **782–834** | 5 | **5 / 20** |

Sauber in beiden Nachmessungen: `/`, `/workplace`, `/chat`, `/transkription`, `/suche`.

| Regel | Schwere | Vorkommen | Routen | WCAG |
| --- | --- | --- | --- | --- |
| `color-contrast` | serious | ~455 | 15 | 1.4.3 (AA) |
| `nested-interactive` | serious | 315 | 6 | 4.1.2 (A) |
| `button-name` | **critical** | 9 | 3 | 4.1.2 (A) |
| `aria-allowed-attr` | **critical** | 3 | 1 | 4.1.2 (A) |
| `link-name` | serious | 0 | 0 | 2.4.4 (A) |

---

## 2. Was die Zahlen bedeuten

**Vorkommen ≠ Defekte.** Die 1027 Vorkommen gehen auf eine sehr kleine Zahl von
Ursachen zurück — dieselbe Komponente, auf 20 Routen gezählt. Nach Ursachen sortiert
ist die Liste kurz und die Arbeit überschaubar. Das ist die eigentliche Erkenntnis
der Messung: es sieht nach 1000 Problemen aus und sind ungefähr acht.

---

## 3. Ursache 1 — die eingeklappte Sidebar (behoben)

`Sidebar.tsx` blendete die Beschriftung im eingeklappten Zustand mit `hidden`
(= `display: none`) aus. Damit ist das Label **aus dem Accessibility-Tree
entfernt**, nicht nur unsichtbar: jeder Sidebar-Eintrag hatte gar keinen
zugänglichen Namen. Mit Screenreader war die eingeklappte Hauptnavigation nicht
bedienbar — man hört „Schaltfläche", ohne zu erfahren, welche.

Behoben durch `sr-only` statt `hidden`: visuell identisch, aber der Text bleibt
für Screenreader stehen.

| | vorher | nachher |
| --- | --- | --- |
| `button-name` | 225 | **9** |
| `link-name` | 108 | **0** |

**333 von 1027 Vorkommen aus einer Zeile.** Das ist zugleich die Rechtfertigung
für die ganze Lane: statisch war das nicht zu finden — `hidden` ist eine gültige
Tailwind-Klasse und die Komponente sieht in jedem Code-Review korrekt aus.
Sichtbar wird es erst am berechneten Accessibility-Tree im echten Browser.

## 4. Ursache 2 — Farbkontrast, und zwar in wenigen Tokens

Der größte verbleibende Block. Nach Farbpaaren gruppiert:

| Vorkommen | Vordergrund auf Hintergrund | Ist | Soll | Wo |
| --- | --- | --- | --- | --- |
| **~174** | `#7c7c7c` auf `#ffffff` / `#f9f9f9` (`text-grey-500`) | 3,96–4,17 | 4,5 | überall — Metazeilen, Beschreibungen, Sekundärtext |
| 10 | `#527b65` auf `#dcefe3` | 3,99 | 4,5 | Karten-Untertitel |
| 6 | `#ffffff` auf `#6a9583` (`badge variant="secondary"`) | 3,36 | 4,5 | `/agents`, `/apps` |
| 4 | `#ffffff` auf `#5f8575` (`button variant="brand"`) | 4,11 | 4,5 | `/documents`, `/agents`, `/apps` |
| 3 | `#9aa8a1` auf `#ffffff` (Platzhaltertext) | 2,47 | 4,5 | Composer-Platzhalter |
| 1 | `#989898` auf `#ffffff` (`button variant="ghost"`) | 2,88 | 4,5 | `/settings` |

**`text-grey-500` allein steht für rund 174 Vorkommen.** `#7c7c7c` erreicht 4,17:1;
für 4,5:1 auf Weiß genügt eine Abdunklung auf etwa `#767676` — optisch praktisch
nicht wahrnehmbar. Ein Token, ein Commit, ~174 Verstöße weg.

Die Verteilung über die Modi widerlegt eine naheliegende Annahme: **hell ist der
schlechteste Modus** (227 von 376 in der Erstmessung), dunkel der beste (32). Wer
nur den Dark Mode prüft, findet 90 % davon nicht.

## 5. Ursache 3 — `nested-interactive` (315)

Karten, die als Ganzes klickbar gemacht wurden (`<div role="button" tabIndex={0}>`)
und **fokussierbare Elemente enthalten** — Buttons, Links, Menüs. Für die Maus
funktioniert das; per Tastatur und Screenreader ist das Ergebnis mehrdeutig:
Der äußere Container meldet sich als eine Schaltfläche, die Kinder sind trotzdem
einzeln anfahrbar.

Betroffen: `/boards`, `/agentura`, `/agents`, `/office`, `/studio`, `/image-studio` —
also die Karten-/Galerie-Ansichten. Das ist **dasselbe Muster**, das ESLint
statisch als `click-events-have-key-events` / `no-static-element-interactions`
meldet (70 Warnungen): Bedienelement aus einem `div` gebaut.

Korrekte Auflösung ist nicht `role="button"` auf dem Container, sondern das
verschachtelte Bedienelement aufzulösen — üblicherweise über einen Link/Button
auf dem Titel plus einen absolut positionierten Overlay-Link („stretched link"),
sodass genau *ein* Bedienelement je Karte im Tab-Fokus liegt.

## 6. Ursache 4 — `aria-allowed-attr` (3, `/studio`)

`driver.js` (die Produkt-Tour) setzt `aria-haspopup` und `aria-expanded` auf ein
`<div>` ohne Rolle. Fremdcode, keine eigene Komponente — Auflösung entweder über
eine Tour-Konfiguration, die ein Bedienelement statt eines Containers anspricht,
oder als dokumentierte Ausnahme.

---

## 7. Statisches Gitter (ESLint)

Erhoben mit `eslint-plugin-jsx-a11y` 6.10.2 bzw. `eslint-plugin-react-native-a11y` 3.5.1.

### `apps/web` — 0 Errors, 172 Warnungen

Die sieben ursprünglichen Errors sind behoben (Details in der Commit-Historie):
drei Fehlalarme (react-markdown-Override, polymorphes `as="h1"`, eine lokale
`role`-Prop, die keine ARIA-Rolle war — umbenannt zu `speaker`) und zwei echte
Befunde (`ImageGallery`, `Timeline`: klickbares `div` ohne Rolle).

| Regel | Warnungen | Dateien |
| --- | --- | --- |
| `no-static-element-interactions` | 43 | 31 |
| `anchor-is-valid` | 42 | 23 |
| `click-events-have-key-events` | 27 | 19 |
| `label-has-associated-control` | 25 | 16 |
| `no-autofocus` | 24 | 22 |
| `no-noninteractive-element-interactions` | 8 | 7 |
| `media-has-caption` | 5 | 5 |

### `apps/mobile` — 0 Errors, **295 Warnungen in 108 Dateien**

Alle aus `has-valid-accessibility-descriptors`: Touch-Bedienelemente ohne
`accessibilityLabel`/`accessibilityRole`. Bei 261 `.tsx`-Dateien und rund 409
`Pressable`/`TouchableOpacity` heißt das: **die Mehrheit der Bedienelemente der
Expo-App hat keinen Namen.** Mit VoiceOver/TalkBack ist die App damit nicht
sinnvoll bedienbar. Das ist der schwerwiegendste Einzelbefund des Audits.

---

## 8. Belastbarkeit der Messung — drei Einschränkungen

1. **Die Lane ist auf datengetriebenen Routen nicht deterministisch.** Zwei Läufe
   derselben Fassung ergaben 782 bzw. 834 Vorkommen. Die Differenz stammt fast
   vollständig aus `/boards` (0 vs. 82 im forced-colors-Modus), wo je nach
   geladenen Daten unterschiedlich viel rendert. Deshalb prüft die CI-Lane
   **welche Regeln** verletzt werden (`KNOWN_VIOLATIONS` je Route), nicht **wie
   viele** Vorkommen — eine Zählschwelle würde flackern. Vor der Scharfstellung
   als Required Check sollte der Datenstand fixiert werden (Seed oder MSW).
2. **Automatik deckt 30–40 % ab.** Alles hier Gemessene ist maschinell prüfbar.
   Fokusreihenfolge, Sinnhaftigkeit von Alternativtexten, Verständlichkeit und
   die tatsächliche Screenreader-Bedienbarkeit sind es nicht. Ein grüner Lauf ist
   kein Konformitätsnachweis.
3. **Geprüft wurde der Einstiegszustand jeder Route.** Dialoge, geöffnete Menüs,
   Formulare im Fehlerzustand und der Chat während des Streamings sind nicht
   erfasst — dort sitzen erfahrungsgemäß die Fokus- und `aria-live`-Probleme
   (nur 11 `aria-live` im gesamten Frontend). Das ist der nächste Ausbauschritt
   der Lane.

---

## 9. Reproduzieren

```bash
# Backend + Container müssen laufen; Bypass im Web-Env gesetzt
#   apps/web/.env:  VITE_E2E_AUTH_BYPASS=true
#   .env:           ALLOW_DEV_AUTH_BYPASS=true, DEV_AUTH_BYPASS_TOKEN=…
pnpm --filter @gruenerator/web test:a11y

# Nur das statische Gitter (Sekunden, kein Browser, kein Backend)
pnpm --filter @gruenerator/web exec eslint src
pnpm --filter @gruenerator/mobile exec eslint .
```
