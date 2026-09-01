# Barrierefreiheit — Bestandsaufnahme, Toolchain, Optimierungsplan

Stand: 02.08.2026 · Geltungsbereich: `apps/web`, `packages/{ui,chat,shared,sites,canvas-editor}`, `apps/mobile`

---

## 1. Welcher Standard ist „der modernste"?

| Norm | Version | Rolle für uns |
| --- | --- | --- |
| **WCAG 2.2 AA** | W3C Recommendation, Okt 2023 | **Der operative Zielstandard.** Alles Prüfbare hängt hier dran. |
| WCAG 3.0 | Working Draft | Nicht auditierbar, kein Zielstandard. Ignorieren. |
| **EN 301 549** | v4.1.1 (2025) | Europäischer Prüfrahmen. Referenziert WCAG 2.2 AA **und** deckt Nicht-Web-Software ab → **das ist die Norm, unter der die Expo-App überhaupt prüfbar wird.** |
| BITV 2.0 (DE) | — | Öffentliche Stellen. Liefert das Format für die „Erklärung zur Barrierefreiheit". |
| BFSG (DE) / BaFG (AT) | in Kraft seit 28.06.2025 | Umsetzung des European Accessibility Act. Ob der Grünerator als „Dienstleistung im elektronischen Geschäftsverkehr" in den Anwendungsbereich fällt, ist eine **Rechtsfrage, keine Entwicklerfrage** — muss geklärt werden, bevor wir eine Konformitätsaussage veröffentlichen. |

**Konsequenz:** Wir auditieren gegen **WCAG 2.2 AA im Rahmen von EN 301 549**. Für die Web-App ist das der `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`-Tag-Satz in axe-core; für die Expo-App die EN-301-549-Kapitel 5/11 (Software) plus die Plattform-Leitfäden (Apple HIG Accessibility, Android Accessibility).

**Wichtigste Erwartungssteuerung:** Automatisierte Prüfung findet **rund 30–40 % der WCAG-Verstöße**. Der Rest (Fokusreihenfolge, sinnvolle Alternativtexte, Bedienbarkeit mit Screenreader, Verständlichkeit) braucht manuelle Prüfung. Ein Plan, der nur aus Tools besteht, ist kein Audit — deshalb sind unten Welle 3 und Welle 5 manuell.

---

## 2. Bestandsaufnahme — was wir schon haben

### 2.1 Web: unerwartet gute Basis

| Vorhanden | Wo | Bewertung |
| --- | --- | --- |
| `axe-core` 4.12 + `vitest-axe` 0.1 | `apps/web/package.json` | ✅ Echte Prüfsubstanz |
| `configureAxe` mit dokumentierter jsdom-Anpassung | [test-utils.tsx](apps/web/src/test-utils.tsx#L15) | ✅ `color-contrast` bewusst abgeschaltet, Begründung im Code |
| axe-Matcher global registriert | [vitest.setup.ts](apps/web/vitest.setup.ts) | ✅ |
| **22 von 46** `.vitest.tsx` benutzen axe | `apps/web/src` | 🟡 gute Quote, aber 46 Tests auf 454 Komponenten |
| Radix (`radix-ui` Umbrella) + `@base-ui/react` | [packages/ui/package.json](packages/ui/package.json) | ✅ **Der größte stille Gewinn**: Dialog/Menu/Tabs/Combobox bringen Fokusfalle, Rollen und Tastaturmodell mit. 132 Radix-Dialog-Instanzen sind damit im Grundsatz korrekt. |
| `prefers-reduced-motion`, `prefers-reduced-transparency`, `forced-colors` | [accessibility.css](apps/web/src/assets/styles/accessibility.css) | ✅ Sauber, inkl. Nutzereinstellung, die nur *zusätzlich* reduzieren kann |
| Einstellungen → Barrierefreiheit | [AccessibilityTab.tsx](apps/web/src/features/settings/tabs/AccessibilityTab.tsx) | ✅ 3 Schalter |
| Skip-Link + `<main id="main-content">` | [App.tsx](apps/web/src/App.tsx) | 🟠 vorhanden, aber **opt-in** — siehe Lücke L4 |
| `<html lang="de">` | [index.html](apps/web/index.html) | ✅ |
| `accessibilityHelpers.ts`, 285 Z. | [accessibilityHelpers.ts](apps/web/src/components/utils/accessibilityHelpers.ts) | 🟡 aria-live-Region, Fokus-Helfer — Nutzungsgrad unklar |
| Playwright 1.61, Chromium, `tests/e2e/` | [playwright.config.ts](apps/web/playwright.config.ts) | ✅ **Die Landebahn für die Browser-Audit-Lane existiert schon** |

Rohzahlen über `apps/web/src` + `packages/{ui,chat,sites,canvas-editor}/src` (786 `.tsx`):
`419× aria-label` · `117× role=` · `50× tabIndex` · `30× sr-only` · `73× <h1>` · `11× aria-live` · `8 von 85 <img> ohne alt`.

### 2.2 Web: die Lücken

| # | Lücke | Warum das zählt |
| --- | --- | --- |
| **L1** | **`eslint-plugin-jsx-a11y` fehlt vollständig** ([react.js](packages/eslint-config/react.js)) | Die billigste Prüfstufe überhaupt, und die einzige, die *vor* dem Commit greift. Größte Einzellücke. |
| **L2** | **Kein a11y-Job in der CI** (`grep a11y .github/workflows/` → 0 Treffer) | Die 22 axe-Tests laufen nur mit, wenn jemand `pnpm test` anfasst. Kein Regressionsschutz, kein Trend. |
| **L3** | **Farbkontrast wird nirgends geprüft** | jsdom kann es nicht (deshalb korrekt abgeschaltet), Playwright macht es nicht von selbst. Damit ist WCAG 1.4.3/1.4.11 aktuell **komplett ungeprüft** — bei einer Marke mit Grün-auf-Grün und einem Dark Mode ist das die wahrscheinlichste Fehlerquelle. |
| **L4** | Skip-Link ist **Nutzereinstellung, Default aus** | WCAG **2.4.1 (Bypass Blocks, Level A)** verlangt den Mechanismus *unkonditioniert*. Ein Schalter, den man erst finden muss, erfüllt das Kriterium nicht. |
| **L5** | Landmarks dünn: 9× `main`, 3× `nav`, 1× `footer`, 13× `aside` auf 786 Dateien | Screenreader-Navigation läuft über Landmarks. |
| **L6** | 50 klickbare `div`/`span`/`li`/`td` ohne `role` | WCAG 4.1.2 + 2.1.1 (Tastaturbedienbarkeit). Betrifft u. a. Karten-/Listenansichten: `BoardListView`, `BoardTableView`, `DocumentCard`, `AgentCard`, `ImageGallery`, `Lightbox`. |
| **L7** | 134 von 167 nativen `<input>` ohne erkennbaren Label-Bezug | Heuristik (kein `aria-label`/`id` im Tag) — ein Teil davon hat umschließende `<label>`. **Muss axe verifizieren, nicht der Grep.** |
| **L8** | Nur **11× `aria-live`** | Bei einer Streaming-Chat-App mit Tool-Calls, Ladezuständen und Toasts ist das zu wenig — WCAG 4.1.3 (Status Messages). |
| **L9** | 8 `<img>` ohne `alt` | Klein, aber trivial zu schließen: `RobotAvatar`, `SharedMediaImage`, `preview-image`, `ComputeCard`, `SearchImagesSection`. |

### 2.3 Expo/Mobile: dünn

| Signal | Wert |
| --- | --- |
| `.tsx` gesamt | 261 |
| Dateien mit `accessibilityLabel` | **53** |
| `accessibilityRole`-Vorkommen | **36** |
| `TouchableOpacity`/`<Pressable>`-Vorkommen | **409** |
| a11y-Lint | ❌ `eslint-plugin-react-native-a11y` fehlt |
| a11y-Assertions in Tests | ❌ keine, obwohl `@testing-library/react-native` + `jest-expo` + Maestro da sind |

**Lesart:** grob geschätzt hat die **Mehrheit der Touch-Ziele weder Namen noch Rolle**. Auf iOS/Android heißt das: VoiceOver/TalkBack liest „Schaltfläche" ohne zu sagen, welche. Das ist der schwerwiegendste Befund im gesamten Audit — und zugleich der mit dem billigsten Gitter (`react-native-a11y` Lint-Regel `has-accessibility-props`).

`@testing-library/react-native` bringt a11y-Queries (`getByLabelText`, `getByRole`) direkt mit — ein Test, der über die Rolle sucht, *ist* schon ein a11y-Test.

---

## 3. Toolchain — was es gibt und was wir davon nehmen

### 3.1 Empfohlen (einführen)

| Ebene | Tool | Was es fängt | Kosten |
| --- | --- | --- | --- |
| **Lint** | `eslint-plugin-jsx-a11y` | ~35 Regeln: fehlende alt, Klickziele ohne Rolle, `aria-*` mit falschem Wert, Labels ohne Feld. Statisch, sofort, im pre-commit. | 1 Dependency |
| **Lint (Expo)** | `eslint-plugin-react-native-a11y` | `accessibilityLabel`/`Role` auf Touchables, ungültige Traits. | 1 Dependency |
| **Komponente** | `vitest-axe` ✅ **haben wir** | Rollen, Namen, ARIA-Validität pro Komponente. | 0 |
| **Browser** | **`@axe-core/playwright`** (`AxeBuilder`) | Alles was jsdom nicht kann: **Farbkontrast**, berechnete Styles, echte Fokusreihenfolge, `wcag22aa`-Tags. Läuft auf den Routen, nicht auf Komponenten. | 1 Dependency, Playwright steht schon |
| **Struktur-Regression** | **Playwright `toMatchAriaSnapshot()`** | Friert den Accessibility-Tree einer Route als YAML ein. Bricht, wenn ein Refactor die Überschriftenhierarchie oder Rollen zerlegt — das fängt kein axe-Regelsatz. Der modernste Baustein der Liste. | 0 (in Playwright enthalten) |
| **Budget/Trend** | Lighthouse CI, Kategorie `accessibility` | Ein Zahlenwert pro Route über die Zeit, Schwellwert in der CI. Ergänzt axe, ersetzt es nicht. | GitHub Action |
| **Manuell (Web)** | axe DevTools, Accessibility Insights for Web, ARC Toolkit; NVDA (Win) / VoiceOver (macOS) | Die fehlenden 60 %. | Zeit |
| **Manuell (Mobile)** | Android **Accessibility Scanner**, Xcode **Accessibility Inspector** | Touch-Zielgrößen, Kontrast, fehlende Labels — direkt auf dem Gerät. | Zeit |

### 3.2 Bewusst *nicht* einführen

- **Pa11y / Pa11y-CI** — nutzt intern HTML_CodeSniffer bzw. axe; neben `@axe-core/playwright` redundant, zweite Browser-Startkette.
- **IBM Equal Access Checker** — guter Regelsatz, aber überlappt zu ~90 % mit axe. Zwei Regelsätze = zwei Fehlerlisten = keiner wird abgearbeitet.
- **Storybook `addon-a11y`** — hervorragend, aber wir haben kein Storybook. Nur einführen, wenn Storybook aus anderen Gründen kommt.
- **WAVE** — Browser-Extension, nicht CI-fähig. Als Zweitmeinung im manuellen Test okay, nicht als Werkzeug im Repo.
- **Appium + `mobile: performAccessibilityAudit`** — echter Espresso-ATF-Audit auf Android, aber eine ganze zweite E2E-Infrastruktur neben Maestro. Erst erwägen, wenn Welle 4 abgearbeitet ist.

---

## 4. Optimierungsplan

Fünf Wellen. Jede ist einzeln mergebar und liefert einen Wert, auch wenn die nächste nie kommt. Reihenfolge ist bewusst *Gitter vor Reparatur*: erst verhindern, dass neue Fehler entstehen, dann die alten abtragen — sonst repariert man gegen einen Zufluss.

---

### Welle 0 — Messen, bevor irgendwas geändert wird (≈ ½ Tag)

Ohne Ausgangswert ist jeder spätere Fortschritt eine Behauptung.

1. `@axe-core/playwright` **nur lokal** installieren, Wegwerf-Spec über ~15 Kernrouten laufen lassen:
   `/` · `/chat` · `/login` · `/einstellungen` · `/dokumente` · `/notebooks` · `/gruen-o-mat` · `/sharepic` · `/boards` · `/agentura` · `/wissen` · `/office` · `/reisekosten` · `/bilder` · `/transkription`
2. Ergebnis nach `docs/a11y-baseline-2026-08.json` + eine Tabelle (Route × Regel × impact).
3. Dasselbe für Dark Mode **und** `forced-colors: active` — Kontrastfehler verstecken sich fast immer in genau einem der drei Modi.
4. **Akzeptanz:** Eine Zahl steht fest („X Verstöße, davon Y critical/serious, über Z Routen"). Diese Zahl ist der Nenner für alles Weitere.

---

### Welle 1 — Das Lint-Gitter (≈ 1 Tag)

**Web:** `eslint-plugin-jsx-a11y` in [packages/eslint-config/react.js](packages/eslint-config/react.js), neben `react` und `react-hooks`.

```js
// packages/eslint-config/react.js
import a11yPlugin from 'eslint-plugin-jsx-a11y';
// …
plugins: { react: reactPlugin, 'react-hooks': reactHooksPlugin, 'jsx-a11y': a11yPlugin },
rules: {
  ...a11yPlugin.flatConfigs.recommended.rules,

  // Sofort scharf — 0 oder nahe 0 Verstöße, und die Regeln sind eindeutig:
  'jsx-a11y/alt-text': 'error',
  'jsx-a11y/anchor-has-content': 'error',
  'jsx-a11y/aria-props': 'error',
  'jsx-a11y/aria-role': 'error',
  'jsx-a11y/role-has-required-aria-props': 'error',
  'jsx-a11y/no-redundant-roles': 'error',

  // Staffel: erst 'warn', Ablaufdatum in den PR schreiben (→ Welle 3)
  'jsx-a11y/click-events-have-key-events': 'warn',      // ~50 Fundstellen (L6)
  'jsx-a11y/no-static-element-interactions': 'warn',     // dito
  'jsx-a11y/label-has-associated-control': 'warn',       // ~134 Kandidaten (L7)
  'jsx-a11y/no-autofocus': 'warn',                       // 47 Fundstellen
},
```

> `no-autofocus` bewusst nur `warn`: 47 Vorkommen, und in Dialogen ist Autofokus meist *richtig* — Radix setzt ihn ohnehin selbst. Hier ist die Einzelfallprüfung teurer als der Gewinn; die Regel dient als Inventarliste, nicht als Verbot.

**Expo:** `eslint-plugin-react-native-a11y` in eine eigene Config-Sektion für `apps/mobile/**`. Zentrale Regel: `react-native-a11y/has-valid-accessibility-descriptors` (bzw. `has-accessibility-props`) auf `warn`.

- **Akzeptanz:** `pnpm lint` läuft grün durch; `error`-Stufe hat 0 Verstöße; die `warn`-Zahlen sind protokolliert (das ist die Arbeitsliste für Welle 3/4).
- **Wichtig:** ESLint aus dem Wurzelverzeichnis prüft weniger als der Paket-Aufruf — vor dem Push zusätzlich `cd apps/web && pnpm run lint`.

---

### Welle 2 — Browser-Audit-Lane + CI (≈ 1–2 Tage)

Die Lane, die L2 und L3 gleichzeitig schließt.

**2a — `apps/web/tests/e2e/a11y.spec.ts`**

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ROUTES = ['/', '/chat', '/einstellungen', '/dokumente', /* … Welle-0-Liste */];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const route of ROUTES) {
  test(`a11y: ${route}`, async ({ page }) => {
    await page.goto(route);
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations).toEqual([]);
  });
}
```

- Auth über den bestehenden Dev-Bypass (`VITE_E2E_AUTH_BYPASS`) — sonst prüfen wir 15× die Login-Seite.
- Dark-Mode- und `forced-colors`-Varianten als eigene Playwright-Projekte (`colorScheme: 'dark'`, `forcedColors: 'active'`), nicht als Schleife im Test.
- **Startzustand ist eine Ausnahmeliste, kein `toEqual([])`.** Die Welle-0-Befunde kommen als kommentierte `disableRules`/Route-Ausnahmen rein, jede mit Ticket-Referenz. Sonst ist die Lane am ersten Tag rot und wird abgeschaltet.

**2b — ARIA-Snapshots** für die 5 strukturell wichtigsten Routen (`/`, `/chat`, `/einstellungen`, `/dokumente`, `/office`) via `expect(page.locator('main')).toMatchAriaSnapshot()`. Fängt zerlegte Überschriftenhierarchien, die axe nie meldet.

**2c — CI-Job** `.github/workflows/a11y.yml`: auf PRs, die `apps/web/**` oder `packages/{ui,chat}/**` anfassen. Playwright-Browser cachen. Bericht als PR-Kommentar.

- **Akzeptanz:** Der Job läuft auf einem PR und ist grün; ein absichtlich eingebauter Verstoß (`<img>` ohne alt) macht ihn rot.

---

### Welle 3 — Befunde abtragen, Web (≈ 3–5 Tage, portionierbar)

Priorisiert nach *Schwere × Häufigkeit*, nicht nach Bequemlichkeit:

| Prio | Arbeitspaket | Bezug |
| --- | --- | --- |
| **P0** | **Skip-Link per Default an.** `show_skip_link` bleibt als Einstellung bestehen (Nutzer:innen können ihn *verbergen*), aber der Default kippt auf `true`. Migration + Default in der DB-Spalte. | L4, WCAG 2.4.1 (A) |
| **P0** | **Farbkontrast.** Alle Welle-0-Kontrastfehler in hell/dunkel/forced-colors. Achtung: `neutral-500/600/700` sind im Tokenset Sandtöne, keine Graustufen — Kontrastrechnung nicht aus dem Tailwind-Standard ableiten. | L3, WCAG 1.4.3/1.4.11 |
| **P0** | **8 `<img>` ohne alt.** Dekorativ → `alt=""`, inhaltstragend → Text. | L9, WCAG 1.1.1 (A) |
| **P1** | **50 Klickziele ohne Rolle** → `<button>`/`<a>` statt `div`, oder `role` + `tabIndex` + Tastaturhandler. Vorlage einmal bauen, dann durchziehen. | L6, WCAG 2.1.1 (A) |
| **P1** | **Formularfelder** — axe-Liste aus Welle 2 abarbeiten (nicht die Grep-Liste). Sichtbares `<Label htmlFor>` bevorzugen, `aria-label` nur wo kein sichtbares Label existiert. | L7, WCAG 3.3.2 (A) |
| **P1** | **Statusmeldungen** — Chat-Streaming, Tool-Calls, Toasts, Ladezustände über `aria-live`/`role="status"`. `announceToScreenReader()` existiert bereits, wird aber kaum genutzt. | L8, WCAG 4.1.3 (AA) |
| **P2** | **Landmarks** in `PageLayout` je `layoutMode` vereinheitlichen: genau ein `<main>`, `<nav>` mit `aria-label` je Navigationsbereich, `<header>`/`<footer>` je Seite. | L5 |
| **P2** | **Fokusreihenfolge & sichtbarer Fokus** manuell durchklicken (Tab-only, Maus weglegen). Fokus-Styles hängen an der Modalität (`kbd:`-Attribut am `<html>`) — neue Ringe dort anhängen, sonst greifen sie nie. | WCAG 2.4.7, 2.4.11 |
| **P3** | Jede Ausnahme aus Welle 2b entfernen. Am Ende steht `expect(violations).toEqual([])` ohne Ausnahmeliste. | — |

Parallel: neue `.vitest.tsx`-Tests bekommen den axe-Block per Default (steht schon so in `apps/web/CLAUDE-testing.md`-Konvention — Datei fehlt allerdings im Repo, obwohl CLAUDE.md sie referenziert → im Zuge dessen anlegen oder Referenz korrigieren).

---

### Welle 4 — Expo-App (≈ 3–4 Tage)

Getrennte Welle, weil die Prüfmittel andere sind und niemand darauf warten muss.

1. **Lint scharfstellen** (aus Welle 1) und die `warn`-Liste abarbeiten: alle 409 `Pressable`/`TouchableOpacity` bekommen `accessibilityRole` + `accessibilityLabel` (bzw. `accessible={false}` mit Begründung, wenn ein Kind den Namen trägt).
2. **Touch-Zielgröße ≥ 44×44 pt** (WCAG 2.5.8 AA in 2.2) — mit dem **Accessibility Scanner** (Android) und dem **Accessibility Inspector** (Xcode) auf den Hauptflüssen prüfen: Chat, Agenten, Einstellungen, Bilder.
3. **Dynamic Type / Schriftskalierung**: prüfen, dass Layouts bei 200 % Systemschrift nicht abschneiden. `allowFontScaling` nicht global abschalten.
4. **`@testing-library/react-native` auf a11y-Queries umstellen**: `getByRole`/`getByLabelText` statt `getByTestId`. Damit prüft jeder bestehende Test nebenbei den Accessible Name.
5. **Maestro**: bestehende Flows auf `assertVisible` über Labels statt IDs umstellen.
6. **Screenreader-Durchlauf**: je ein kompletter Hauptfluss mit TalkBack und mit VoiceOver, protokolliert.

- **Akzeptanz:** `accessibilityLabel`-Abdeckung auf Touchables > 95 % (heute: geschätzt < 25 %); ein TalkBack- und ein VoiceOver-Protokoll liegen vor.

---

### Welle 5 — Erklärung, Doku, Dauerbetrieb (≈ 2 Tage)

1. **Öffentliche Doku-Seite „Barrierefreiheit"** → `documentation/docs/basics/barrierefreiheit.md`, verlinkt in [sections.ts](documentation/src/nav/sections.ts) unter `topPages` von *Basics*. Gliederung:
   - Was wir zusagen (Zielstandard WCAG 2.2 AA / EN 301 549) und **was aktuell noch nicht erfüllt ist** — eine ehrliche Liste ist normkonform, eine geschönte nicht.
   - Welche Einstellungen es gibt (Animationen, Transparenz, Sprung-Link, Schriftgröße) und wo sie liegen.
   - Tastaturbedienung: die tatsächlichen Kürzel.
   - Screenreader-Hinweise (getestet mit …).
   - **Barriere melden**: konkreter Kontaktweg + Reaktionszeit. Das ist der Teil, den BITV/BFSG verbindlich verlangen.
   - Stand-Datum + Prüfverfahren (Selbstbewertung vs. externer BITV-Test).
   - AT-Variante mitdenken (BaFG statt BFSG) — der Grünerator hat Österreich als gleichrangiges Publikum.
2. **Rechtliche Einordnung klären** (nicht durch die Entwicklung): Fällt der Grünerator unter BFSG/BaFG? Davon hängt ab, ob die Seite eine *Erklärung zur Barrierefreiheit* im Rechtssinn ist oder eine freiwillige Selbstauskunft. **Vor Veröffentlichung klären** — eine falsche Konformitätsaussage ist schlechter als keine.
3. **`CLAUDE-styling.md` bzw. eine neue `CLAUDE-a11y.md`**: die Konventionen, die ab jetzt gelten (axe-Block in neuen Komponententests, Label-Regel, Landmark-Regel, Fokus-Modalität).
4. **Dauerbetrieb**: a11y-Job als Required Check; halbjährlicher manueller Durchlauf; Doku-Seite mit Stand-Datum pflegen (die `docs-freshness`-Workflows existieren bereits).

---

## 5. Aufwand & Reihenfolge auf einen Blick

| Welle | Inhalt | Aufwand | Blockiert durch |
| --- | --- | --- | --- |
| 0 | Baseline messen | ½ Tag | — |
| 1 | Lint-Gitter Web + Expo | 1 Tag | — (parallel zu 0) |
| 2 | axe-Playwright-Lane + ARIA-Snapshots + CI | 1–2 Tage | 0 |
| 3 | Web-Befunde abtragen | 3–5 Tage | 2 |
| 4 | Expo | 3–4 Tage | 1 |
| 5 | Doku-Seite + Erklärung + Dauerbetrieb | 2 Tage | 3, 4 (inhaltlich) |

**Größter Hebel pro Aufwand:** Welle 1 (ein Tag, verhindert dauerhaft Neuzugang) und Welle 2 (schließt die einzige komplett blinde Stelle: Farbkontrast).
**Schwerster Einzelbefund:** die Expo-App — dort ist der Anteil unbenannter Bedienelemente am höchsten.

---

## 6. Neue Abhängigkeiten

```
# Welle 1
apps/web (bzw. packages/eslint-config)  eslint-plugin-jsx-a11y
apps/mobile                             eslint-plugin-react-native-a11y

# Welle 2
apps/web                                @axe-core/playwright
```

Drei Dev-Dependencies insgesamt. Alles andere ist bereits vorhanden oder in Playwright enthalten.
