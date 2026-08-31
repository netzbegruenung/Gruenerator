# Grünerator Dokumentation

Offizielle Dokumentation für den Grünerator - das Tool für grüne Organisationen zur automatischen Generierung von Dokumenten und zur nahtlosen Integration mit der Grünen Wolke.

## 🚀 Über das Projekt

Diese Dokumentation wurde mit [Docusaurus](https://docusaurus.io/) erstellt und bietet umfassende Anleitungen und Tutorials für die Nutzung des Grünerators.

## 📚 Inhalte

- **Grüne Wolke Tutorial**: Schritt-für-Schritt Anleitung zur Einrichtung der Grünen Wolke für die nahtlose Integration mit dem Grünerator
- Weitere Tutorials und Anleitungen folgen...

## 🧭 Guides schreiben

`docs/guides/` beantwortet **eine Aufgabe**, während die Bereichs-Doku (`chat/`, `office/`, …) beschreibt, **was es gibt**. Ein Guide wiederholt die Referenz nicht, er verlinkt sie am Ende.

**Ablage:** Ordner = Erfahrungsstand (`einsteigerinnen/`, später weitere), `tags:` im Frontmatter = Aufgabenfeld (`kommunikation`, `gremienarbeit`, `wissen`, `verwaltung`). Docusaurus baut aus den Tags eigene Übersichtsseiten unter `/docs/tags/…`.

**Form:**

- Titel ist die Frage, die jemand stellt („Wie schreibe ich …?").
- Erster Absatz: was am Ende dasteht und wie lange es dauert. Keine Einleitung über das Produkt.
- `## So geht's` — 3 bis 6 nummerierte Schritte, jeder Schritt genau eine Handlung. Beispieleingaben als Codeblock.
- `## Damit …` — 2 bis 4 Stellschrauben, mit denen das Ergebnis besser wird.
- `## Wenn …` — die zwei, drei häufigsten Stolpersteine, inklusive der Sorgfaltspflichten (Zahlen prüfen, Kennzeichnung).
- `## Weiterlesen` — Verweise in die Bereichs-Doku.
- Zielmarke: **300 bis 400 Wörter**, eine Bildschirmseite. Wird es länger, ist es zwei Guides oder gehört in die Referenz.

**Handwerk:** Du-Form. UI-Namen über `<UiLabel id="…" />`, nie abtippen — ein umbenannter Menüpunkt soll den Build brechen, nicht die Doku still veralten. Nach neuen Seiten `pnpm docs:index` laufen lassen, sonst schlägt der Pflicht-Check in der CI fehl.

## 🛠️ Entwicklung

Diese Dokumentation ist Teil des [Grünerator Monorepos](https://github.com/netzbegruenung/Gruenerator).

### Voraussetzungen

- Node.js (Version 18.0 oder höher)
- pnpm (Package Manager)

### Lokale Entwicklung

**Von der Monorepo-Root aus:**

```bash
# Entwicklungsserver starten
pnpm run dev:documentation
```

**Direkt im documentation/ Verzeichnis:**

```bash
cd documentation
pnpm run dev
```

Dieser Befehl startet einen lokalen Entwicklungsserver auf http://localhost:3000. Die meisten Änderungen werden live übernommen, ohne dass der Server neu gestartet werden muss.

### Build

**Von der Monorepo-Root aus:**

```bash
# Produktions-Build erstellen
pnpm run build:documentation
```

**Direkt im documentation/ Verzeichnis:**

```bash
cd documentation
pnpm run build
```

Dieser Befehl generiert statische Inhalte in das `build`-Verzeichnis und kann mit jedem statischen Content-Hosting-Service bereitgestellt werden.

### Bereitstellung

```bash
# Build lokal testen
cd documentation
pnpm run serve
```

## 🤝 Beitragen

Beiträge sind willkommen! Bitte erstelle einen Pull Request oder öffne ein Issue für Verbesserungsvorschläge.

## 📄 Lizenz

Dieses Projekt steht unter der [MIT Lizenz](LICENSE).

## 🔗 Links

- [Grünerator](https://gruenerator.de)
- [Grüne Wolke](https://wolke.netzbegruenung.de)
- [Docusaurus Dokumentation](https://docusaurus.io/)
