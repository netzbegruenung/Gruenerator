# Grünerator Dokumentation

Offizielle Dokumentation für den Grünerator - das Tool für grüne Organisationen zur automatischen Generierung von Dokumenten und zur nahtlosen Integration mit der Grünen Wolke.

## 🚀 Über das Projekt

Diese Dokumentation wurde mit [Docusaurus](https://docusaurus.io/) erstellt und bietet umfassende Anleitungen und Tutorials für die Nutzung des Grünerators.

## 📚 Inhalte

- **Grüne Wolke Tutorial**: Schritt-für-Schritt Anleitung zur Einrichtung der Grünen Wolke für die nahtlose Integration mit dem Grünerator
- Weitere Tutorials und Anleitungen folgen...

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
