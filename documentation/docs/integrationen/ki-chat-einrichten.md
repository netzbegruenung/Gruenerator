---
sidebar_position: 1
---

# Grünerator in ChatGPT & Co nutzen

Du kannst den Grünerator direkt in **ChatGPT**, **Claude**, **Mistral Le Chat** oder **OpenWebUI** verwenden — ohne gruenerator.eu öffnen zu müssen. Dein KI-Assistent durchsucht dann grüne Parteiprogramme, findet Positionen zu Themen und greift auf deine eigenen Grünerator-Inhalte zu: Dokumente, Boards, Notizbücher, Projekte.

:::info[Was ist MCP?]
MCP (Model Context Protocol) ist ein offener Standard, über den KI-Chatbots auf externe Datenquellen zugreifen können — hier sorgt es dafür, dass dein Chat-Assistent den Grünerator nutzen kann.
:::

## Was du dafür brauchst

- Ein **Grünerator-Konto** — die Verbindung läuft über deine Anmeldung
- Ein Konto bei einem der unterstützten KI-Chats (ChatGPT, Claude, Mistral Le Chat oder OpenWebUI)
- ChatGPT: Ein Plan mit Connector-Unterstützung (Plus, Pro oder Team)

:::info[Die Adresse ist überall dieselbe]
`https://mcp.gruenerator.eu`

Ältere Anleitungen nennen `…/mcp` oder `…/v2` — beide funktionieren weiter und
führen an dieselbe Stelle.
:::

## Wie die Anmeldung abläuft

Beim ersten Verbinden schickt dich dein KI-Chat auf die Grünerator-Anmeldung. Danach siehst du eine **Zustimmungsseite**, auf der steht, worauf die Verbindung zugreifen darf — Suche, eigene Inhalte lesen, eigene Inhalte anlegen, Projekte, Medien. Erst nach deiner Zustimmung steht die Verbindung.

Du gibst dabei **kein Passwort** an den KI-Chat weiter, und du kannst die Verbindung jederzeit im Grünerator wieder entziehen.

Ein Zugangsschlüssel ist nicht nötig: **Client-ID und Geheimnis bleiben leer** — die Chat-Dienste melden sich selbst am Grünerator an.

## Einrichtung

### ChatGPT

1. Öffne [chatgpt.com](https://chatgpt.com) und logge dich ein.
2. Klicke oben rechts auf dein **Profil** → **Settings**.
3. Wähle in der Sidebar **Connectors**.
4. Aktiviere unter **Advanced** den **Developer Mode**, damit du eigene Verbindungen hinzufügen kannst.
5. Klicke auf **Create** bzw. **Add custom connector**.
6. Trage folgende Daten ein:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu`
   - **Authentication**: **OAuth** — Client-ID und Client Secret **leer lassen**
7. Speichern. ChatGPT leitet dich zur Grünerator-Anmeldung und anschließend auf die Zustimmungsseite.
8. Fertig — der Grünerator steht nun in normalen Chats und in Deep Research als Datenquelle zur Verfügung.

---

### Claude

1. Öffne [claude.ai](https://claude.ai) und logge dich ein.
2. Klicke oben rechts auf dein **Profil** → **Settings**.
3. Gehe in der linken Sidebar auf **Integrations**.
4. Klicke auf **Add integration**.
5. Trage folgende Daten ein:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu`
6. Speichern und auf **Connect** klicken — melde dich an und stimme zu.
7. Fertig! Claude nutzt den Grünerator nun automatisch, wenn es zu deiner Anfrage passt.

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
   - **URL**: `https://mcp.gruenerator.eu`
   - **Auth**: **OAuth**
6. Speichern, anmelden, zustimmen.
7. Im Chat die Verbindung aktivieren:
   - In der Seitenleiste unter **Connectors** den Grünerator anhaken, **oder**
   - im Prompt `/Grünerator` eingeben, um ihn als Tool zu aktivieren.

---

### OpenWebUI (für Fortgeschrittene)

[OpenWebUI](https://openwebui.com/) ist eine selbst gehostete Chat-Oberfläche, die viele verschiedene KI-Modelle unterstützt. Ab **Version 0.6** kann der Grünerator direkt eingebunden werden.

1. Öffne die OpenWebUI-Einstellungen → **Tools** → **MCP Servers**.
2. Füge einen neuen Server hinzu:
   - **Name**: `Grünerator`
   - **URL**: `https://mcp.gruenerator.eu`
   - **Auth**: **OAuth**
3. Speichern, anmelden, zustimmen und im Chat als Tool aktivieren.

---

## Übersicht

| Plattform           | Wo einrichten?                         | URL                          | Anmeldung                 |
| ------------------- | -------------------------------------- | ---------------------------- | ------------------------- |
| **ChatGPT**         | Settings → Connectors (Developer Mode) | `https://mcp.gruenerator.eu` | OAuth, Felder leer lassen |
| **Claude**          | Settings → Integrations                | `https://mcp.gruenerator.eu` | OAuth, läuft automatisch  |
| **Mistral Le Chat** | Settings → Connectors → Custom MCP     | `https://mcp.gruenerator.eu` | OAuth                     |
| **OpenWebUI**       | Settings → Tools → MCP Servers         | `https://mcp.gruenerator.eu` | OAuth                     |

---

## Wenn es nicht klappt

**„Unauthorized" oder die Verbindung fragt nicht nach der Anmeldung.** Entferne die Verbindung und lege sie neu an — manche Clients merken sich einen alten Stand.

**Die Verbindung stand schon einmal und ist plötzlich weg.** Mit der Zusammenlegung der beiden früheren Server hat sich die Kennung geändert; einmal neu verbinden genügt.

**Es kommt nur „Keine Treffer".** Suche mit einzelnen Begriffen statt mit ganzen Sätzen — und nenne das Land, wenn es um Österreich geht.

---

## Und jetzt?

Du hast den Grünerator mit deinem KI-Chat verbunden — erfahre jetzt, **[was du alles fragen kannst](./mcp-was-kann-ich-fragen)**: von der Suche in Parteiprogrammen über Social-Media-Beispiele bis hin zu spezialisierten Assistenten für Reden, Anträge und Öffentlichkeitsarbeit.

Es geht übrigens auch andersherum: Mit **[Konnektoren](./konnektoren)** verbindest du externe Dienste wie Notion oder Tally mit dem Grünerator-Chat.
