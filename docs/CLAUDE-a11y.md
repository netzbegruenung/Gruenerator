# CLAUDE-a11y.md

Zielstandard **WCAG 2.2 AA im Rahmen von EN 301 549** — die einzige Norm, unter
der auch die Expo-App prüfbar ist. Öffentliche Selbstauskunft:
`documentation/docs/basics/barrierefreiheit.md` (Stand-Datum
pflegen!). Gesamtplan und Messwerte: `docs/barrierefreiheit-audit-plan.md`,
`docs/barrierefreiheit-followup-audit.md` — beide unter `/docs/`, also
gitignored, `git add -f` nötig.

## Der Satz, der über allem steht

**Automatik deckt 30–40 % ab. Ein grüner Lauf ist kein Konformitätsnachweis.**
Und: *bei jedem grünen Prüflauf zuerst fragen, wie viele Prüfungen tatsächlich
gelaufen sind* — nicht, ob welche durchgefallen sind. Der CI-Check „axe-core
(WCAG 2.2 AA)" war monatelang auf jedem PR grün und hatte 22 von 22 Prüfungen
übersprungen.

## Prüfmittel — welches wofür

| Ebene | Werkzeug | Findet |
| --- | --- | --- |
| statisch, bei jeder Änderung | `jsx-a11y` (Web), `react-native-a11y` (Expo) | fehlende Namen, `<div>` als Knopf, ungültige Rollen |
| Komponente | `axe` aus `apps/web/src/test-utils` im vitest-dom-Lane | verletzte ARIA-Verträge in einer Komponente |
| Seite, echter Browser | `apps/web/tests/e2e/a11y.spec.ts` (axe-core + Playwright) | Kontrast, berechneter Accessibility-Tree, Landmarks |
| Struktur | `a11y-structure.spec.ts` (ARIA-Snapshots) | Regressionen in der Vorlesereihenfolge |

**Regel:** Wo `aria-*` oder `role=` von Hand gesetzt wird, gehört ein
`axe`-Block in den Komponententest. Details zur dom-Lane in
`apps/web/CLAUDE-testing.md`.

Eine Regel, die auf `warn` stehen bleibt, **nachdem** ihre Fundstellen behoben
sind, schützt nichts — nach dem Aufräumen auf `error` ziehen. Bewusste
Ausnahmen (`no-autofocus`: in Dialogen ist Autofokus richtig;
`media-has-caption`: Inhaltsarbeit) gehören kommentiert.

## Farbe

**Ein Farbtoken, das zugleich `bg-` und `text-` bedient, ist im Dunkelmodus
unlösbar.** Der Grund will dunkel sein, der Text hell. Vor jeder
Token-Verschiebung die Rollen zählen (`bg-`/`text-`/`border-`, und ob sie
`dark:`-qualifiziert sind). Hat ein Token keine Textrolle, darf es in beiden
Modi ziehen; sonst hell umstellen, dunkel auf Bestand lassen.

Textgraue gehören an die themeabhängigen `-val`-Token (`--grey-text-val`,
`--grey-text-weak-val`), **nicht** an die Rampenstufen — die tragen auch Ränder
und Deaktiviert-Zustände, und die sind von 1.4.3 ausgenommen.

**`opacity` frisst den Kontrast von allem darin.** Deckkraft wirkt auf das ganze
Element, auch auf korrekt gefärbte Kinder. axe meldet die *gemischte* Farbe —
ein gemeldeter Wert, der in keiner Rampe vorkommt, ist das Erkennungszeichen.
Gedämpfte Töne gehören an ein Farbtoken (`text-muted-foreground`), nie an einen
Deckkraft-Regler.

**Die Rampe liegt in mehreren Kopien vor** (`apps/web`, `packages/chat`,
`packages/canvas-editor`, `packages/docs`, `documentation`) plus
`apps/mobile/theme/colors.ts` — das zusätzlich **Alias-Namen** führt
(`colors.eucalyptus`), und der Alias ist das, was die Komponenten wirklich
benutzen. Wer eine Stufe ändert, greppt alle.

**Hell ist der schlechteste Modus**, nicht dunkel: 227 von 376 Kontrastbefunden
der Baseline lagen dort. Wer nur den Dunkelmodus prüft, findet 90 % nicht.

## Struktur & Bedienung

- Genau **ein** `<main>` je Seite, `<nav>` mit `aria-label` je Bereich.
- **Nichts mit `hidden` ausblenden, was vorlesbar bleiben soll** —
  `display:none` entfernt es aus dem Accessibility-Tree. `sr-only` verwenden.
  Das war der schwerste Einzelbefund des Audits, 333 von 1027 Vorkommen.
- Klickbare Karten: das Bedienelement sitzt auf dem Titel, nicht auf dem
  Container (`packages/ui/src/components/interactive-card.tsx`). Genau **ein**
  Tabstopp pro Karte.
- **dnd-kit setzt selbst `role="button"` + `tabIndex 0`** auf den
  Sortier-Wrapper. Auflösung ist nicht „Ziehen nur am Griff", sondern die
  Listener aufteilen: Zeiger-Listener bleiben am Wrapper, `attributes` und
  `onKeyDown` wandern auf einen echten `<button>`. Dazu
  `attributes: { roleDescription: '…' }`, sonst liest der Screenreader
  dnd-kits englisches „sortable".
- Fokusringe hängen an der Modalität am `html`-Attribut — neue Fokus-Styles an
  `kbd:` hängen.
- `role="button"` schuldet **Enter und Leertaste**, mit `preventDefault()` gegen
  das Scrollen — außer im Eingabefeld, wo die Leertaste ein Leerzeichen ist.

## Expo

Deutsche Labels, Verb + Objekt (`accessibilityLabel="Aufnahme starten"`). **Nie**
„Button"/„Schaltfläche" im Label — die Rolle sagt das System an.
`accessibilityHint` nur, wenn die Folge nicht aus dem Label hervorgeht.
Dekoratives mit `accessibilityElementsHidden` ausblenden statt zu beschriften.
Produkt-Wording gilt auch hier („Grüneratoren", „Rezepte", „Projekte").

Ein statischer Linter ist kein Laufzeit-Audit: Kontrast, Fokusreihenfolge und
die Ansagen von VoiceOver/TalkBack sind damit **nicht** geprüft. Für React
Native gibt es keine axe-Entsprechung — dafür braucht es einen Gerätedurchlauf.

## Messen ohne sich selbst zu betrügen

Der Dev-Auth-Bypass ist die häufigste Fehlerquelle. Ohne ihn landet jede Route
auf `/login`, und die Lane prüft zwanzigmal dieselbe Seite — grün, ohne Aussage.

```bash
export $(grep -E "^VITE_E2E_AUTH_BYPASS=|^VITE_DEV_AUTH_BYPASS_TOKEN=" .env | xargs) \
  && VITE_DEV_PORT=3200 npx vite
```

`--port` auf der Kommandozeile setzt `VITE_DEV_PORT` **nicht**, und der
Origin-Rewrite im Vite-Proxy hängt daran. Vor der Messung prüfen:
`curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/api/auth/profile`
muss **200** liefern, nicht 401.

Das Cookie-Banner liegt sonst über jeder Seite — Schlüssel vorsetzen wie in
`apps/web/tests/e2e/fixtures/pageHelpers.ts`.

**Ein Nicht-Befund ohne Daten ist kein Beleg.** `/boards` meldete kein
`nested-interactive`, weil das Board leer war. Deshalb prüft `KNOWN_VIOLATIONS`
*welche Regeln* je Route verletzt werden, nicht *wie viele Vorkommen* — zwei
Läufe derselben Fassung ergaben 782 vs. 834.
