# Integration der YouPage-Komponente

Diese Anleitung beschreibt, wie die neue YouPage-Komponente in die bestehende App integriert werden kann.

## 1. Route in der App hinzufügen

Füge die YouPage-Komponente in deine Routing-Struktur ein. In der Regel befindet sich diese in der `App.js` oder einer separaten Routing-Datei.

```jsx
import YouPage from './components/YouPage';

// In deiner Route-Definition:
<Route path="/you" element={<YouPage />} />
```

## 2. Navigation aktualisieren

Füge einen Link zur YouPage in deine Navigation ein:

```jsx
<Nav.Link as={Link} to="/you">Grünerator U</Nav.Link>
```

## 3. API-Endpunkte prüfen

Stelle sicher, dass alle API-Endpunkte korrekt konfiguriert sind. Die YouPage verwendet folgende Endpunkte:

- `/you` - Für die Kategorisierung des Prompts
- `/claude_social` - Für Social-Media-Inhalte
- `/claude_rede` - Für Reden
- `/claude_universal` - Für allgemeine Texte
- `/claude/antrag` - Für Anträge
- `/claude_gruene_jugend` - Für GRÜNE JUGEND Inhalte

## 4. Testen

Teste die Integration mit verschiedenen Prompts, um sicherzustellen, dass die Kategorisierung und Weiterleitung korrekt funktionieren.

## 5. Fehlerbehandlung

Die Komponenten enthalten bereits grundlegende Fehlerbehandlung. Bei Bedarf kann diese erweitert werden, um spezifischere Fehlermeldungen anzuzeigen.

## 6. Styling

Die Komponenten verwenden Bootstrap-Klassen für das Styling. Bei Bedarf kann das Styling an das Design der App angepasst werden.

## 7. Umgebungsvariablen

Stelle sicher, dass die API-Basis-URL korrekt konfiguriert ist. Diese wird in der Regel in einer `.env`-Datei definiert:

```
REACT_APP_API_BASE_URL=https://deine-api-url.de/api
``` 