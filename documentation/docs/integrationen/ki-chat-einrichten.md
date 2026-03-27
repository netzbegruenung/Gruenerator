---
sidebar_position: 1
---

# Grünerator in ChatGPT & Co nutzen

Du kannst den Grünerator direkt in **ChatGPT**, **Claude**, **Mistral Le Chat** oder **OpenWebUI** verwenden — ohne gruenerator.eu öffnen zu müssen. Dein KI-Assistent kann dann grüne Parteiprogramme durchsuchen, Positionen zu Themen finden und dir beim Schreiben politischer Texte helfen.

:::info Was ist MCP?
MCP (Model Context Protocol) ist ein offener Standard, über den KI-Chatbots auf externe Datenquellen zugreifen können — hier sorgt es dafür, dass dein Chat-Assistent den Grünerator nutzen kann.
:::

## Was du dafür brauchst

- Ein Konto bei einem der unterstützten KI-Chats (ChatGPT, Claude, Mistral Le Chat oder OpenWebUI)
- ChatGPT: Ein Plan mit Connector-Unterstützung (Plus, Pro oder Team)

## Einrichtung

### ChatGPT

1. Öffne [chatgpt.com](https://chatgpt.com) und logge dich ein.
2. Klicke oben rechts auf dein **Profil** → **Settings**.
3. Wähle in der Sidebar **Connectors**.
4. Aktiviere unter **Advanced** den **Developer Mode**, damit du eigene Verbindungen hinzufügen kannst.
5. Klicke auf **Create** bzw. **Add custom connector**.
6. Trage folgende Daten ein:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu/mcp`
   - **Auth**: Keine (leer lassen)
7. Speichern — der Grünerator steht nun in normalen Chats und in Deep Research als Datenquelle zur Verfügung.

---

### Claude

1. Öffne [claude.ai](https://claude.ai) und logge dich ein.
2. Klicke oben rechts auf dein **Profil** → **Settings**.
3. Gehe in der linken Sidebar auf **Integrations**.
4. Klicke auf **Add integration**.
5. Trage folgende Daten ein:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu/mcp`
   - **Auth**: Keine (leer lassen)
6. Speichern — fertig! Claude nutzt den Grünerator nun automatisch, wenn es zu deiner Anfrage passt.

:::tip
Du kannst die Verbindung auch manuell im Chat aktivieren, indem du sie in der Tool-Auswahl anhakst.
:::

---

### Mistral Le Chat

1. Öffne [chat.mistral.ai](https://chat.mistral.ai) und logge dich ein.
2. Gehe in der linken Sidebar auf **Connectors** (oder über Profil → **Settings** → **Connectors**).
3. Klicke auf **Add Connector**.
4. Wähle den Tab **Custom MCP Connector**.
5. Trage folgende Daten ein:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu/mcp`
   - **Auth**: Keine (leer lassen)
6. Speichern.
7. Im Chat die Verbindung aktivieren:
   - In der Seitenleiste unter **Connectors** den Grünerator anhaken, **oder**
   - im Prompt `/Grünerator` eingeben, um ihn als Tool zu aktivieren.

---

### OpenWebUI (für Fortgeschrittene)

[OpenWebUI](https://openwebui.com/) ist eine selbst gehostete Chat-Oberfläche, die viele verschiedene KI-Modelle unterstützt. Ab **Version 0.6** kann der Grünerator direkt eingebunden werden.

1. Öffne die OpenWebUI-Einstellungen → **Tools** → **MCP Servers**.
2. Füge einen neuen Server hinzu:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu/mcp`
3. Speichern und im Chat als Tool aktivieren.

---

## Übersicht

| Plattform           | Wo einrichten?                         | URL                              | Anmeldung nötig? |
| ------------------- | -------------------------------------- | -------------------------------- | ---------------- |
| **ChatGPT**         | Settings → Connectors (Developer Mode) | `https://mcp.gruenerator.eu/mcp` | Nein             |
| **Claude**          | Settings → Integrations                | `https://mcp.gruenerator.eu/mcp` | Nein             |
| **Mistral Le Chat** | Settings → Connectors → Custom MCP     | `https://mcp.gruenerator.eu/mcp` | Nein             |
| **OpenWebUI**       | Settings → Tools → MCP Servers         | `https://mcp.gruenerator.eu/mcp` | Nein             |

---

## Und jetzt?

Du hast den Grünerator mit deinem KI-Chat verbunden — erfahre jetzt, **[was du alles fragen kannst](./mcp-was-kann-ich-fragen)**: von der Suche in Parteiprogrammen über Social-Media-Beispiele bis hin zu spezialisierten Assistenten für Reden, Anträge und Öffentlichkeitsarbeit.
