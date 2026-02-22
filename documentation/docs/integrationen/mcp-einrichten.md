---
sidebar_position: 1
---

# Grünerator MCP einrichten

Das **Model Context Protocol (MCP)** ist ein offener Standard, mit dem KI-Chatbots auf externe Datenquellen zugreifen können. Der Grünerator stellt einen MCP-Server bereit, über den KI-Assistenten wie Claude, Mistral Le Chat oder ChatGPT direkt auf grüne Parteiprogramme, Beschlüsse und Dokumente zugreifen können.

Das bedeutet: Du kannst in deinem bevorzugten KI-Chat grüne Inhalte abfragen, ohne den Grünerator selbst öffnen zu müssen.

:::info Was bringt mir das?
Mit dem Grünerator-MCP kann dein KI-Assistent z.B. Wahlprogramme durchsuchen, Positionen zu bestimmten Themen finden oder Formulierungen aus Parteitagsbeschlüssen zitieren — direkt im Chat.
:::

## Claude (claude.ai)

1. Öffne [claude.ai](https://claude.ai) und logge dich ein.
2. Klicke oben rechts auf dein **Profil** → **Settings**.
3. Gehe in der linken Sidebar auf **Connectors**.
4. Klicke auf **Add connector** bzw. **Add MCP server**.
5. Trage folgende Daten ein:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu/mcp`
   - **Auth**: Keine (leer lassen)
6. Speichern — fertig! Claude nutzt den Grünerator-MCP nun automatisch, wenn es zu deiner Anfrage passt.

:::tip
Du kannst den Connector auch manuell im Chat aktivieren, indem du ihn in der Tool-Auswahl anhakst.
:::

**Offizielle Doku:**

- [Remote MCP-Server verbinden](https://modelcontextprotocol.io/docs/develop/connect-remote-servers)
- [Custom Connectors (Support-Artikel)](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)

---

## Mistral Le Chat (chat.mistral.ai)

1. Öffne [chat.mistral.ai](https://chat.mistral.ai) und logge dich ein.
2. Gehe in der linken Sidebar auf **Connectors** (oder über Profil → **Settings** → **Connectors**).
3. Klicke auf **Add Connector**.
4. Wähle den Tab **Custom MCP Connector**.
5. Trage folgende Daten ein:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu/mcp`
   - **Auth**: Keine (leer lassen)
6. Speichern.
7. Im Chat den Connector aktivieren:
   - In der Seitenleiste unter **Connectors** den Grünerator anhaken, **oder**
   - im Prompt `/Grünerator` eingeben, um ihn als Tool zu aktivieren.

**Offizielle Doku:**

- [Custom MCP-Connector konfigurieren](https://help.mistral.ai/en/articles/393572-configuring-a-custom-connector)
- [MCP-Connector in Le Chat benutzen](https://help.mistral.ai/en/articles/393511-using-my-mcp-connectors-with-le-chat)
- [Ankündigung: Le Chat Custom MCP Connectors](https://mistral.ai/news/le-chat-mcp-connectors-memories)

---

## ChatGPT (chatgpt.com)

1. Öffne [chatgpt.com](https://chatgpt.com) und logge dich ein (ein Plan mit **Connectors**-Unterstützung ist nötig).
2. Klicke oben rechts auf dein **Profil** → **Settings**.
3. Wähle in der Sidebar **Connectors**.
4. Aktiviere unter **Advanced** den **Developer Mode**, damit du eigene MCP-Server hinzufügen kannst.
5. Klicke auf **Create** bzw. **Add custom connector**.
6. Trage folgende Daten ein:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu/mcp`
   - **Auth**: Keine (leer lassen)
7. Speichern — der Connector steht nun in normalen Chats und in Deep Research als Datenquelle zur Verfügung.

**Offizielle Doku:**

- [MCP mit ChatGPT (Platform Docs)](https://platform.openai.com/docs/mcp)
- [Schritt-für-Schritt-Guide Connectors](https://www.remote-mcp.com/chatgpt-connectors)

---

## Für Nerds: OpenWebUI

[OpenWebUI](https://openwebui.com/) ist eine selbst gehostete Chat-Oberfläche, die viele verschiedene KI-Modelle unterstützt. Ab **Version 0.6** hat OpenWebUI native MCP-Unterstützung.

### Variante 1: Native MCP (ab v0.6)

1. Öffne die OpenWebUI-Einstellungen → **Tools** → **MCP Servers**.
2. Füge einen neuen Server hinzu:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu/mcp`
3. Speichern und im Chat als Tool aktivieren.

### Variante 2: mcpo-Proxy (für ältere Versionen)

Für OpenWebUI-Versionen vor 0.6 kannst du den MCP-Server über [mcpo](https://github.com/nicholasgasior/mcpo) als OpenAPI-kompatiblen Proxy bereitstellen:

```bash
# mcpo installieren
pip install mcpo

# Proxy starten (wandelt MCP → OpenAPI um)
mcpo --port 8080 --api-key "" -- \
  npx mcp-remote https://mcp.gruenerator.eu/mcp
```

Dann in OpenWebUI unter **Connections** → **OpenAPI** die URL `http://localhost:8080` eintragen.

---

## Übersicht

| Plattform           | Wo einrichten?                         | MCP-URL                          | Auth nötig? |
| ------------------- | -------------------------------------- | -------------------------------- | ----------- |
| **Claude**          | Settings → Connectors                  | `https://mcp.gruenerator.eu/mcp` | Nein        |
| **Mistral Le Chat** | Settings → Connectors → Custom MCP     | `https://mcp.gruenerator.eu/mcp` | Nein        |
| **ChatGPT**         | Settings → Connectors (Developer Mode) | `https://mcp.gruenerator.eu/mcp` | Nein        |
| **OpenWebUI**       | Settings → Tools → MCP Servers         | `https://mcp.gruenerator.eu/mcp` | Nein        |
