---
sidebar_position: 1
description: 'Den Grünerator per MCP mit ChatGPT, Claude, Le Chat oder OpenWebUI verbinden.'
---

# Wie verbinde ich den Grünerator mit ChatGPT & Co.?

Über den **MCP-Server** kannst du Funktionen des Grünerators auch in anderen KI-Chats verwenden. Der externe Chat kann dann zum Beispiel Parteiprogramme durchsuchen oder – nach deiner Zustimmung – auf eigene Inhalte im Grünerator zugreifen.

:::info[Was ist MCP?]
Das Model Context Protocol (MCP) ist ein offener Standard, über den KI-Anwendungen externe Werkzeuge und Datenquellen verwenden können.
:::

## Was du brauchst

- ein Grünerator-Konto
- ein Konto bei einem KI-Chat, der eigene MCP-Verbindungen unterstützt
- bei Arbeits- oder Organisationskonten gegebenenfalls die Freigabe einer administrierenden Person

Für alle Anwendungen verwendest du dieselbe Server-Adresse:

```text
https://mcp.gruenerator.eu
```

Ältere Anleitungen nennen zusätzlich `/mcp` oder `/v2`. Diese Adressen werden weiterhin weitergeleitet; für eine neue Verbindung genügt die Adresse oben.

## Wie die Anmeldung funktioniert

Nach dem Anlegen der Verbindung öffnet sich die Grünerator-Anmeldung. Anschließend bestätigst du auf einer Zustimmungsseite, worauf der KI-Chat zugreifen darf. Dein Grünerator-Passwort wird dabei nicht an den anderen Anbieter übermittelt.

Wenn die Anwendung nach **Client-ID** oder **Client Secret** fragt, lasse diese Felder leer. Der Grünerator unterstützt die automatische Registrierung des Clients.

## ChatGPT

Eigene MCP-Verbindungen stehen in ChatGPT nicht in jedem Tarif zur Verfügung. In verwalteten Arbeitsbereichen muss eine administrierende Person den Entwicklermodus gegebenenfalls zuerst erlauben.

1. Öffne in ChatGPT **Settings → Apps → Advanced settings** und aktiviere den **Developer mode**.
2. Öffne anschließend **Settings → Apps**. In einem verwalteten Arbeitsbereich findest du die Verwaltung unter **Workspace settings → Apps**.
3. Klicke auf **Create app**.
4. Trage `Grünerator` als Namen und `https://mcp.gruenerator.eu` als MCP-Server-Adresse ein.
5. Wähle **OAuth**, falls ChatGPT nach der Authentifizierung fragt. Lasse Client-ID und Client Secret leer.
6. Speichere die Verbindung, melde dich beim Grünerator an und bestätige den Zugriff.
7. Aktiviere die App im jeweiligen Chat über die Werkzeug- oder App-Auswahl.

Die aktuell unterstützten Tarife und die genaue Verwaltung für Arbeitsbereiche beschreibt die [offizielle ChatGPT-Anleitung](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).

## Claude

1. Öffne in Claude **Settings → Connectors**.
2. Klicke auf **Add custom connector**.
3. Trage `Grünerator` als Namen und `https://mcp.gruenerator.eu` als Server-Adresse ein.
4. Speichere die Verbindung, melde dich beim Grünerator an und bestätige den Zugriff.
5. Aktiviere den Grünerator im Chat unter **Search and tools**.

Bei Team- und Enterprise-Konten muss eine organisationsweite Verbindung zunächst von einer administrierenden Person angelegt werden. Details stehen in der [offiziellen Claude-Anleitung](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp).

## Mistral Le Chat

1. Öffne in Le Chat die Seite **Connectors**.
2. Klicke auf **+ Add Connector** und wähle **Custom MCP Connector**.
3. Trage einen Namen und `https://mcp.gruenerator.eu` als Server-Adresse ein.
4. Wähle **OAuth**, speichere und bestätige anschließend die Anmeldung beim Grünerator.
5. Aktiviere den Konnektor im Chat, bevor du deine Anfrage sendest.

In Organisationen benötigt das Anlegen eines eigenen Konnektors administrative Rechte. Die aktuellen Schritte dokumentiert [Mistral](https://docs.mistral.ai/vibe/work/connectors/mcp-connectors).

## OpenWebUI

Für diese Schritte brauchst du Administrationsrechte in deiner OpenWebUI-Installation. Die Installation muss externe MCP-Server über **Streamable HTTP** unterstützen.

1. Öffne **Admin Settings → Integrations**.
2. Klicke unter **External Tool Servers** auf **+ Add Connection**.
3. Wähle **MCP (Streamable HTTP)**.
4. Trage `Grünerator` als Namen und `https://mcp.gruenerator.eu` als Server-Adresse ein.
5. Wähle **OAuth 2.1**, speichere und bestätige die Anmeldung beim Grünerator.
6. Aktiviere den Server anschließend in der Werkzeugauswahl des Chats.

Die Menünamen können sich je nach installierter Version unterscheiden. Maßgeblich ist die [OpenWebUI-Dokumentation](https://docs.openwebui.com/features/extensibility/mcp/).

## Verbindung testen

Bitte den externen Chat nach dem Verbinden zunächst um eine einfache Suche, zum Beispiel:

> Welche Positionen enthalten grüne Parteiprogramme zum Thema kommunale Wärmeplanung?

Zeigt der Chat vor der Ausführung eine Werkzeugfreigabe, prüfe den genannten Grünerator-Zugriff und bestätige ihn. Ob und wann ein externer Chat ein Werkzeug automatisch auswählt, entscheidet die jeweilige Anwendung.

## Wenn es nicht klappt

**Es öffnet sich keine Anmeldung:** Prüfe, ob Pop-ups blockiert werden. Entferne die Verbindung bei Bedarf und lege sie neu an.

**Die Anwendung verlangt zwingend eine Client-ID:** Prüfe zuerst, ob du wirklich eine benutzerdefinierte MCP-Verbindung mit OAuth anlegst. Manche Anwendungen oder ältere Versionen unterstützen die automatische Client-Registrierung noch nicht.

**Der Grünerator erscheint nicht im Chat:** Aktiviere ihn in der App-, Konnektor- oder Werkzeugauswahl des aktuellen Chats. Das Einrichten allein aktiviert ihn nicht zwingend für jede Unterhaltung.

**Die Suche liefert keine passenden Treffer:** Formuliere zuerst einen klaren Suchbegriff und nenne Deutschland oder Österreich, wenn der Länderkontext wichtig ist.

## Was kann ich danach fragen?

Der Guide **[Was kann ich den Grünerator-MCP-Server fragen?](../../sonstiges/mcp-was-kann-ich-fragen.mdx)** zeigt die verfügbaren Funktionen und Beispiele. Wenn du stattdessen externe Dienste _im Grünerator-Chat_ verwenden möchtest, lies **[Wie richte ich Konnektoren für den Chat ein?](./konnektoren-einrichten.mdx)**.
