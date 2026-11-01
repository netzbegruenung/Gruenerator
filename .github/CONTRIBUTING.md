# Mitwirken am Grünerator

Danke, dass du mithelfen willst. Diese Seite erklärt, wie ein Beitrag reibungslos durchläuft. Die ausführlichen Regeln für den Code stehen in [`CLAUDE.md`](../CLAUDE.md). Die Datei richtet sich an Menschen und an Coding-Agents gleichermaßen.

## Sprache

Alles, was auf GitHub landet, wird auf **Englisch** geschrieben: Commit-Nachrichten, Branch-Namen, Pull-Request-Titel und -Beschreibungen, Issues und Kommentare. Diese Richtlinien und die Doku im Repository bleiben deutsch.

## Bevor du anfängst

- **Fehler:** Lege ein Issue mit dem Bug-Formular an. Schreib dazu, wie man ihn auslöst, und füge Logzeilen oder Screenshots bei.
- **Größere Änderungen und neue Funktionen:** Beginne mit einem Issue, damit wir die Richtung klären, bevor Code entsteht.
- **Kleine Korrekturen** (Tippfehler, Doku, ein offensichtlicher Fehler samt Test): Ein Pull Request ohne Issue reicht.
- **Sicherheitslücken:** niemals öffentlich, siehe [`SECURITY.md`](../SECURITY.md).

## Einrichten

Du brauchst Node 22 (siehe `.nvmrc`) und pnpm in der Version aus `packageManager` (`corepack enable`). Wie du die Abhängigkeiten installierst, die Dienste (Postgres, Redis, Qdrant) einrichtest und Web und API startest, steht im [README](../README.md#getting-started).

Lokal geht es auch ohne Keycloak, über den Dev-Auth-Bypass. Wie das funktioniert, steht in `CLAUDE.md` unter „Dev Auth Bypass“.

## Arbeitsweise

- **Branch:** von `master` abzweigen, ein Thema pro Pull Request.
- **Commits:** nach [Conventional Commits](https://www.conventionalcommits.org/), auf Englisch, das Subject nach dem Doppelpunkt kleingeschrieben (`fix(chat): keep the scope after a reload`). commitlint prüft das. Pro Commit eine logische Änderung.
- **Issues schließen:** In die PR-Beschreibung gehört `Closes #123`. GitHub erkennt nur englische Schlüsselwörter.
- **Merges:** nur reguläre Merges, kein Squash. Gemergt wird von den Maintainern.
- **Österreich zählt mit:** de-AT ist ein eigenes Publikum, kein Sonderfall. Neue Texte, Agents und Prompts denken AT von Anfang an mit.
- **Parteiinterne Inhalte gehören nicht in dieses Repository.** Prompts, Personas und interne Korpora liegen im privaten Repository und werden zur Laufzeit geladen. `pnpm check:internal` bewacht diese Grenze.
- **Umbenennungen:** Datenbank-Spalten, Contract-Felder, gespeicherte IDs und Env-Variablen werden nicht umbenannt (F0). Was dabei gilt, steht in `CLAUDE.md` unter „Naming, IDs & Renames“.

## Prüfen

Prüf nur die Pakete, die du geändert hast, und lass die Prüfungen nacheinander laufen, nicht gleichzeitig:

```bash
pnpm --filter @gruenerator/<paket> exec tsc --noEmit
pnpm --filter @gruenerator/<paket> exec vitest run <datei>
npx eslint <dateien>
pnpm format:check
pnpm check:internal
```

Eine Fehlerkorrektur bringt einen Test mit, der ohne sie fehlschlägt. Den vollständigen Lauf übernimmt die CI am Pull Request. Ein lokaler Volllauf (`pnpm run ci`) braucht viel Speicher und ist nicht nötig.

## Pull Requests

- Fülle die Vorlage aus: was sich ändert, warum, und wie du es getestet hast.
- Bei Änderungen an der Oberfläche gehören Screenshots dazu, im Hell- und im Dunkelmodus.
- Die CI muss grün sein.

## KI-gestützte Beiträge

Coding-Agents dürfen helfen. Verantwortlich für jede Zeile bist trotzdem du: Lies den Diff, lass die Prüfungen laufen und reiche keinen Code ein, den du nicht erklären kannst. Agents lesen [`CLAUDE.md`](../CLAUDE.md).

## Lizenz deines Beitrags

Der Grünerator steht unter der [GNU Affero General Public License v3.0](../LICENSE). Mit einem Beitrag stellst du ihn unter diese Lizenz.

Zusätzlich räumst du Moritz Wächter das einfache, zeitlich unbegrenzte und unwiderrufliche Recht ein, deinen Beitrag auch unter anderen Open-Source-Lizenzen zu veröffentlichen. Ein Beispiel ist die MPL-2.0, unter der Teile des Grünerators als [ggraphic](https://www.npmjs.com/package/@ggraphic/editor) erscheinen. Dein Urheberrecht bleibt dabei bei dir.

Mit dem Einreichen bestätigst du, dass du diese Rechte einräumen darfst.

## Verhalten und Kontakt

Es gilt unser [Code of Conduct](../CODE_OF_CONDUCT.md). Fragen beantworten wir über die GitHub-Issues oder unter [info@moritz-waechter.de](mailto:info@moritz-waechter.de).
