# Übergabe: Deutsche Lokalisierung als Upstream-PR an tmustier/pi-for-excel

**Stand:** 31.07.2026 · Arbeitsrepo: `/Users/moritzwachter/gruenerator-excel` (unser Fork) · Referenz: `/Users/moritzwachter/github-inspirationen/pi-for-excel` (unveränderter Upstream-Klon)

## Auftrag

Unsere deutsche Übersetzung so aufbereiten, dass sie als **eigenständiger, sauberer PR** an [tmustier/pi-for-excel](https://github.com/tmustier/pi-for-excel) (MIT) gehen kann. Reine Lokalisierung — nichts Grüneratorspezifisches.

**Nicht** committen, pushen oder den PR öffnen, ohne dass Moritz zugestimmt hat. Erst das Issue, dann der Draft-PR — so hat der Maintainer es ausdrücklich verlangt.

## Warum das überhaupt Aussicht auf Erfolg hat

tmustier hat PR #554 (chinesische Lokalisierung) geschlossen, aber nicht aus Prinzip. Seine Begründung war rein handwerklich: der Branch kompilierte nicht gegen `main`, hatte Konflikte, basierte auf einer alten Version. Seine Einladung im selben Thread, wörtlich:

> „Localisation is harder for me to verify myself, but if you can vouch for the translation quality, welcome to open an Issue first and submit a draft PR, I'd be happy to review."

Lies die vollständige Diskussion, bevor du anfängst: `gh pr view 554 --repo tmustier/pi-for-excel --comments`.

Zweites Signal: `zh-CN.json` wurde seit Einführung in **11 Feature-Commits mitgepflegt**. Er trägt die Last einer zweiten Sprache nachweislich seit Monaten mit, statt sie einmalig zu mergen und liegen zu lassen. Von 4 externen PRs überhaupt wurde einer gemerged.

## Ausgangslage — gemessene Zahlen, keine Schätzungen

| | Schlüssel |
|---|---|
| Upstream `en.json` (Commit `567fef1`) | **1182** |
| Unser `de.json` | **1179** |

Die Differenz ist **nicht** einfach ein Delta, sondern drei Bewegungen gleichzeitig:

**A — 15 Schlüssel fehlen und müssen nachübersetzt werden.** Wir hatten sie gelöscht, weil unser Fork die zugehörige UI entfernt hat:
`language.english`, `settings.lang.reloading`, `settings.lang.saveFailed`, `settings.row.gateway`, `settings.row.gateway.sub`, `settings.row.providers`, `settings.row.providers.sub`, `settings.row.proxy`, `settings.row.proxy.sub`, `settings.section.language.en`, `settings.section.language.label`, `settings.section.language.zh`, `settings.value.connected_count`, `settings.value.none`, `settings.value.off`

**B — 12 Schlüssel müssen raus** (Grünerator-exklusiv): die zehn `gruenerator.access.*` sowie `settings.row.gruenerator` und `settings.row.gruenerator.sub`.

**C — 34 Werte brauchen ein „Pi"-Rollback.** In unserer Übersetzung wurde der Produktname „Pi" durchgängig durch „Grünerator" ersetzt. Für den Upstream muss das zurück. Achtung beim Genitiv: `files-dialog-filtering.sectionPiNotes` heißt englisch „PI'S NOTES" → deutsch **„Pis Notizen"**, nicht „Pi's Notizen".

Rechenprobe: 1179 − 12 + 15 = **1182** = exakte Upstream-Parität.

Platzhalter-Parität der gemeinsamen Schlüssel ist bereits sauber: 0 Abweichungen, 0 leere Werte.

## Die Falle, an der ein PR dort still scheitert

`tests/i18n-locales.test.ts` liest `en.json` und `zh-CN.json` **hartkodiert per Dateiname**. Die `readdirSync`-Nutzung im Test scannt nur `src/` nach Quellcode und schließt den Locales-Ordner aus. Eine neue `de.json` wird von den bestehenden Tests also **komplett ignoriert**, bis man sie manuell verdrahtet — der PR sieht grün aus und prüft nichts.

Genauso hartkodiert: die Sprachliste in `root-page.ts` (Array-Literal `en`/`zh-CN`) und die zwei Buttons in `welcome-login.ts`. **Es gibt keinen Test, der diese UI-Listen gegen `SUPPORTED_LANGUAGES` abgleicht.** Das ist die eigentliche stille Fehlerquelle.

## Die fünf Dateien

Basis: **frischer Branch von `upstream/main`** (`git fetch upstream` zuerst), nicht von unserem `gruenerator`-Branch.

1. **`src/language/locales/de.json`** (neu) — unser jetziges `de.json`, bereinigt nach A/B/C oben. 1182 Schlüssel.
2. **`src/language/index.ts`** — `SUPPORTED_LANGUAGES = ["en", "zh-CN", "de"]`. **zh-CN bleibt drin**, Default bleibt **`"en"`** — nicht unsere Fork-Werte übernehmen.
3. **`src/commands/builtins/settings-pages/root-page.ts`** — dritte Option im bestehenden `options`-Array: `{ value: "de", label: t("settings.section.language.de") }`.
4. **`src/taskpane/welcome-login.ts`** — dritter Button nach dem Muster von `engBtn`/`zhBtn`. Reine Duplikation, kein Refactor.
5. **`tests/i18n-locales.test.ts`** — **ergänzen, nicht ersetzen.** Die zh-CN-Tests bleiben unangetastet; drei äquivalente neue für `de` (Key-Set-Parität, Platzhalter-Subset, keine leeren Werte).

**Nebenwirkung, die im PR-Text benannt werden muss:** Der neue Label-Key `settings.section.language.de` muss wegen des Paritätstests **auch** in `en.json` und `zh-CN.json` ergänzt werden. Das ist die einzige beabsichtigte Berührung dieser beiden Dateien — je eine Zeile.

## Ein Punkt, der aktiv angesprochen gehört

`hint.explain.prompt`, `hint.quality.prompt`, `hint.financial.prompt`, `hint.format.prompt` sind **keine UI-Strings**: sie werden 1:1 als literale Chat-Nachricht ans Modell geschickt (`src/taskpane/init.ts:408-420`). tmustier hat in #554 vor dem Übersetzen „prompt-facing strings" gewarnt.

Das ausgelieferte `zh-CN.json` übersetzt diese vier aber ebenfalls — der Präzedenzfall spricht also dafür. Trotzdem: **im Issue explizit ansprechen** statt stillschweigend annehmen. Das ist genau die Art Detail, an der ein Reviewer merkt, ob jemand den Code gelesen hat.

## Prüfbefehle, die grün sein müssen

Aus `.github/workflows/ci.yml` des Upstreams:

```
npm run check
npm run test:models && npm run test:context && npm run test:security && npm run test:manifest
npm run build
npm run validate
```

`i18n-locales.test.ts` läuft innerhalb von `test:context` (~90 Dateien in einem Lauf — das ist Upstreams Bündelung, nicht änderbar).

Projekt-Eigenheit: ESLint verbietet dort den Typ `unknown` (`no-restricted-syntax`), der Code nutzt `DynamicValue`.

## Textentwürfe

Beide auf Englisch, sachlich und knapp — tmustier schreibt selbst so. **In keinem der beiden Texte** unseren Provider-Umbau, verdigado oder Grünerator-Interna erwähnen. Das ist ein reiner Lokalisierungsbeitrag.

### Issue

> **Title: German (de) localization**
>
> Following up on #554 — we'd like to offer a full German (de) localization, structured as a clean draft PR from the start rather than a reroll.
>
> **Who's behind it:** a German-speaking project team (Grünerator / netzbegrünung, building tools for German-speaking nonprofits) is preparing this and stands behind the translation quality. Initial coverage is AI-assisted for consistency across ~1180 keys, then reviewed string-by-string by native German speakers before submission.
>
> **Planned scope:** `src/language/locales/de.json` (new, full key parity with `en.json`), registration in `src/language/index.ts` alongside `en`/`zh-CN`, a German option added to the existing language switchers (settings dropdown + welcome-screen bar), and `de`-equivalent tests added to `tests/i18n-locales.test.ts` mirroring the existing zh-CN ones — without touching the zh-CN tests. No other files.
>
> **Two things we'd like your call on before we cut the branch:**
> 1. Terminology and tone — any glossary or preferences you already have? We'd keep "Pi" as the product name rather than localizing it.
> 2. `hint.explain.prompt`, `hint.quality.prompt`, `hint.financial.prompt` and `hint.format.prompt` get inserted as the literal chat message when a user clicks a quick-action button. The shipped `zh-CN.json` already translates these, so we planned to do the same for German — flagging it explicitly since it's adjacent to the "no prompt-facing strings" note from #554.
>
> Happy to open the draft PR once you're comfortable with the plan.

### PR-Beschreibung

> **Title: Add German (de) localization**
>
> ## Summary
> - Adds `src/language/locales/de.json` — full German translation, 1182 keys, exact key-set and placeholder parity with `en.json`.
> - Registers `de` in `SUPPORTED_LANGUAGES` (`src/language/index.ts`), next to `en`/`zh-CN`. Default language stays `en`; zh-CN is untouched.
> - Adds a German option to both existing language switchers — the settings dropdown (`root-page.ts`) and the welcome-screen language bar (`welcome-login.ts`). This needs one new label key, `settings.section.language.de`, added to `en.json` and `zh-CN.json` for parity — the only touch to those two files, one line each.
> - Extends `tests/i18n-locales.test.ts` with three de-equivalent checks (key-set parity, placeholder subset, no empty values), mirroring the existing zh-CN tests. The zh-CN tests are untouched.
>
> ## Parity / quality
> - Every placeholder token (`{count}`, `{model}`, …) in `de.json` is a subset of the corresponding `en.json` token set — verified programmatically, 0 mismatches.
> - No stray keys: `de.json` contains only keys present in `en.json`.
> - Translation is AI-assisted for initial coverage, reviewed by native German speakers before submission.
>
> ## Testing
> `npm run check` · `npm run test:models && npm run test:context && npm run test:security && npm run test:manifest` · `npm run build` · `npm run validate`
>
> ## Out of scope
> Pure localization. No behavior, provider, tool or system-prompt changes.

## Aufwand und Nutzen

**Aufwand: 7–10 Stunden.** de.json bereinigen (12 raus, 15 nach, 34 Pi-Rollbacks, Platzhalter neu verifizieren) 2–3 h · `index.ts` 15 min · UI-Erweiterung plus Paritäts-Key in drei Dateien 1–1,5 h · Testerweiterung 1 h · volle CI-Schleife lokal samt Fixes 1–2 h · **Sichtprüfung im echten Taskpane 1–2 h** (deutsche Strings sind regelmäßig länger als englische, Textumbruch in einer schmalen Sidebar ist ein realer Bruchpunkt) · Texte 0,5 h.

**Risiko: niedrig bis mittel.** Deutsch hat er nicht angefragt, die Einladung war aber unspezifisch für „eine Sprache, für deren Qualität jemand geradesteht". Größtes Restrisiko ist Drift: mergt er während der Review neue Keys, muss `de.json` nachgezogen werden.

**Nutzen:** Die Wartungslast wandert von „bei jedem Upstream-Sync kollidiert unsere `de.json` mit seinen Änderungen" zu „Upstream pflegt sie mit, wie seit 11 Commits bei zh-CN". Dazu eine zweite Qualitätsinstanz durch echtes Review.
