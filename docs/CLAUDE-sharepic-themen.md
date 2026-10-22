# Themen-Sharepics anlegen (Leitfaden)

So sind Pride (`queer`) und Frauen (`frauen`) entstanden (#4825, gruenerator-intern#43). Ein neues Thema geht denselben Weg. Die Punkte mit **Freigabe** hält man an, bis die Person zugestimmt hat.

## 1. Recherche: was posten die Accounts wirklich?

- **Korpus:** Die Sammlung `social_media_examples` in Qdrant enthält rund 1.075 Instagram-Captions der DE- und AT-Accounts (Payload `content`, `country`, `source_account`, `created_at`). Man scrollt sie mit Basic-Auth und api-key aus `apps/api/.env` und filtert per Regex auf das Thema. Dabei die starken Treffer zählen, also Thema in den ersten ~200 Zeichen. Daraus ergeben sich die wiederkehrenden Botschaften und Anlässe.
- **Lücke:** Im Korpus stehen nur Captions, keine Bilder, und er deckt nur wenige Monate ab. Anlässe außerhalb des Zeitraums (8. März, 9. Mai …) fehlen und müssen ergänzt werden.
- **Bilder echter Posts:** **Apify ist gestrichen.** Was es an Bildern nicht gibt, wird aus dem CD abgeleitet. Für AT gilt das besonders: Wenige Posts tragen keinen Länder-Unterschied, AT folgt dann der AT-CI im Repo.
- **Zahlen:** Nur aktuelle Quellen (Vorjahr oder jünger), mit Quelle im Sharepic. Alte Statistiken lehnt die Person ab.

## 2. Vorschlag (Freigabe)

- Mindestens 3 Ideen je Thema, gern mehr, jede mit Botschaft, Form (`zahl`, `termine`, `diagramm`, Zitat …), Grundfläche und Anlass.
- Gedämpfte Varianten (Trauer, Solidarität) explizit zur Wahl stellen. Bei Pride wurden sie gestrichen.
- Das CD bleibt erkennbar: Sonnenblume bzw. AT-Logo, Hausschriften, Layout. Das Thema bringt nur Farben und einen Akzent.
- DE hat das Dreibalken-Format auskommentiert. Für interaktive Bearbeitung eignet sich `einzelbild` auf `foto-oben`.

## 3. Entwürfe DE **und** AT als Artifact (Freigabe)

- Alle Entwürfe selbst am Bild prüfen und korrigieren, dann komplett in **einem** Artifact zeigen.
- Kontrast jeder Schrift-/Flächen-Kombination ≥ 4,5:1 messen. Rückmeldungen dieser Runde betrafen typischerweise Markerfarbe, einzelne Fotos und AT.

## 4. Fotos und Sticker

- **Fotos:** Neue Fotos per Unsplash-API (`UNSPLASH_ACCESS_KEY` in `apps/api/.env`, `orientation=portrait`). **Menschen ja, Porträts nein:** keine erkennbaren Einzelgesichter, Rechte beachten. Gute Fotos in `apps/api/public/sharepic_example_bg/` übernehmen und Alt-Text in `image_alt_texts.json` eintragen. Dateiname nach Unsplash-Muster `vorname-nachname-<id>-unsplash.jpg`, siehe #4827 zur ID-Erkennung.
- **Sticker:** Ein Themen-Zeichen (Flagge o. Ä.) kommt als SVG nach `apps/web/public/studio-tools/stickers/` und als PNG nach `apps/mobile/assets/profilbild/`. Registriert wird es in `packages/shared/src/stickers/catalog.ts`, `profilbild/assets.ts` und im mobilen `profilbildAssets.ts`, dazu `catalog.vitest.ts`.

## 5. Code: wo ein Thema eingreift

**Contracts** (`packages/contracts/src/schemas/sharepicCreator/enums.ts`):
- Wert in `sharepicThemaSchema` ergänzen.
- Grundfarben in `sharepicColorSchema` und `SHAREPIC_THEMA_COLORS` ergänzen. Beides ist F0, also nur additiv.
- `SHAREPIC_LOCALE_COLORS` bleibt das reine CD. `sharepicColorsFor` und die Spec-Validierung erlauben die Themenfarben nur mit passendem `thema`.
- Labels in `items.ts` (`SHAREPIC_COLOR_LABELS`) ergänzen.

**Composer** (`packages/canvas-editor/src/composer/`):
- **Ein Eintrag in `sharepicThemes.ts` (`SHAREPIC_THEMES`).** Das Register ist `satisfies Record<SharepicThema, SharepicThemeDef>`: ein neuer Enum-Wert ohne Eintrag kompiliert nicht. Der Composer fragt nur nach Rollen, nie nach einem Themennamen; ein `=== 'europa'` gehört nirgends sonst hin.
- Rollen je Grundseite (`light`/`dark`; DE-Grasgrün zählt als `dark`, außer `accent.grass` sagt etwas anderes), `null` heißt „CD des Landes":
  - `accent`: `==Wort==`, Zahlen, Ziffern in DE.
  - `atAccentOnLight`: AT-Akzent auf hellem Grund. Auf dunklem Grund behält AT sein CD-Gelb.
  - `marker` `{fill, ink}`: der DE-`++`-Kasten **und** die Akzentzeile der Headline (`akzent`).
  - `badge` `{fill, ink}`: Icon-Scheiben und Datumskreis (DE und AT). Pride hat keinen, dort bleibt beides CD.
  - `cardAccent`: Titel auf der weißen Karte.
  - `chartPalette(dark)`: Diagrammfarben auf der weißen Karte.
  - `terminePills` `{colors, darkInk}`: Terminzeilen als Pillen (Pride).
  - `kennzahlGradient`: Verlauf der großen Zahl (Pride).
  - `sign` `{id, assets, on(ground)}`: das Zeichen in der Fußzeile. `on` bekommt den Grund, auf dem es steht (Fußzeile bzw. obere Ecke, wenn ein Datumskreis unten sitzt), nicht die Textfläche — unter `foto-unten` ist das das Foto. `assets` erkennt auch ein von Hand gesetztes Zeichen (`pageThema` in `utils/vorlagenRelevance.ts`). Asset- und Layer-Ids sind F0.
  - `keepsPhotoColours`: die AT-Grüntönung des Fotostreifens entfällt.
- Jedes Textpaar im Eintrag braucht ≥ 4,5:1; `sharepicThemes.vitest.ts` prüft das für jedes Thema automatisch.
- Rohwerte bleiben in `chromeParts.ts`: Hexwerte in `SHAREPIC_COLOR_HEX`, Zusatztinten in `THEMA_INK`, Asset-Ids (`PRIDE_FLAG_ASSET`, `EUROPA_ASSETS`), helle Flächen in `LIGHT`.
- `sharepicGround.ts`: `GRADIENTS` für Verlaufsflächen.
- `freeform_full.config.tsx` / `freeform_at_full.config.tsx`: Freeform-Paletten (mit Label, deshalb nicht aus dem Register).

**Vorlagen-Tab:**
- `utils/vorlagenRelevance.ts`: `pageThema` erkennt das Thema am Quell-Slide oder am Sticker, `themaScore` wertet gleiches Thema auf, fremdes ab.
- Die Seiten tragen `thema` (`sharepicVorlagen.ts`, API `sharepicVorlagen/catalog.ts`, `WebCanvasEditorProvider.tsx`).
- `liftBlock.ts` übernimmt das Thema aus der Grundfarbe.

**Chat:**
- `apps/api/services/sharepicCreator/draftSchemas.ts` (Feld `thema`).
- Prompts: Den Absatz „Themen-Sharepics“ in `apps/api/prompts/sharepic-creator/kapitel/grundlagen-{de,at}.md` ergänzen, mit Anlässen. **Dieselben Dateien liegen als Kopie im internen Repo** und werden dort mitgezogen.

**Doku:** Neue Farblabels ändern das UI-Label-Manifest. Danach `pnpm --filter @gruenerator/documentation labels:generate` laufen lassen, sonst bricht `labels:check` in der CI. Vor dem Push alle zehn `*:check`-Generatoren laufen lassen (in zsh `"${s}:check"` schreiben).

## 6. Vorlagen im internen Repo (`netzbegruenung/gruenerator-intern`)

- Neue Einträge an `sharepic-vorlagen/{de,at}.json` anhängen. Ids nach dem Muster `de-<thema>-<motiv>`, `herkunft: "beispiel"`, je zwei Chat-Prompts, die die Form nennen. AT verwendet keine `++`-Marker.
- Die Einträge werden per Skript erzeugt, nicht von Hand; das Vorbild ist `themen_vorlagen.py` aus der Pride/Frauen-Sitzung.
- `INTERN_CONTENT_DIR=<intern-worktree> pnpm --filter @gruenerator/api vorlagen:check` muss ohne Befund durchlaufen.
- Thumbnails rendert `apps/web/tests/e2e/harness/render-sharepic-vorlagen.ts <ids…>` gegen ein laufendes Vite (`HARNESS_URL`, `VITE_DEV_PORT`). Die Ids übergibt man per `xargs`, weil zsh sie nicht splittet.

## 7. Prüfen

- **Tests:** `sharepicThemes.vitest.ts` läuft über jedes Thema im Register (hell/dunkel, DE/AT): Kontrast der Paare, Akzentzeile, Marker, Badges, Datumskreis. `composeSharepic.thema.vitest.ts` um das Besondere des neuen Themas erweitern. Darin prüfen: Grundfarbe gehört nur zum Thema, Akzent und Marker mit Kontrast ≥ 4,5:1, Diagrammpalette, Termine und Zeichen in der Fußzeile. Theme-Fälle kommen auch nach `vorlagenRelevance.vitest.ts` und `liftBlock.vitest.ts`.
- **Typecheck:** `tsc` einzeln je Paket, in dieser Reihenfolge: contracts, canvas-editor, api. ESLint über viele Dateien sprengt den Speicher; den vollen Lint macht die CI.
- **Live:** Mit eigener API (eigener Port, `INTERN_CONTENT_DIR`, `ALLOW_DEV_AUTH_BYPASS`) und Vite im Dev-Bypass jede Vorlage öffnen. Prüfen: Ist jedes Element ein Canvas-Item, das sich auswählen, ziehen, per Doppelklick bearbeiten und rückgängig machen lässt?
- **Hinweise:**
  - Tour-Overlay vorher mit Escape schließen.
  - Dev-Server nur per PID und cwd beenden.

## 8. Ausliefern

- Öffentlicher PR gegen master, Englisch, ohne Attribution.
- Der interne PR wird erst gemergt, wenn der öffentliche deployt ist. Sonst lehnt das Prod-Backend die unbekannten `thema`-Werte und Farben ab.
- Worktrees entfernen, sobald alles gepusht ist.
