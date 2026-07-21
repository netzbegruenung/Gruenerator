---
sidebar_position: 3
---

# Konnektoren: Externe Dienste im Chat

Mit **Konnektoren** verbindest du externe Dienste — etwa Notion, Tally oder Brevo — direkt mit dem Grünerator-Chat. Die KI kann dann in deinen Formularen, Dokumenten oder Kontakten arbeiten: _„Erstelle ein Anmeldeformular mit @tally"_ legt das Formular wirklich in deinem Tally-Konto an.

:::warning Experimentelles Feature
Konnektoren sind aktuell **experimentell**. Die Auswahl der Dienste und das Verhalten können sich noch ändern.
:::

:::info Was ist MCP?
Konnektoren basieren auf dem **Model Context Protocol (MCP)** — einem offenen Standard, über den KI-Assistenten sicher auf externe Dienste zugreifen. Das ist dieselbe Technik, mit der du auch den [Grünerator in ChatGPT & Co nutzen](./ki-chat-einrichten) kannst — nur in die andere Richtung.
:::

## Konnektoren öffnen

Du findest die Konnektoren an zwei Stellen:

- In der **Seitenleiste** unten auf deinen Account klicken → **Konnektoren**
- Oder in den **Einstellungen** im Tab **Konnektoren**

## Kurz-Tutorial: In 3 Schritten verbunden

### 1. Dienst auswählen

Im Verzeichnis findest du eine handverlesene Auswahl offizieller Konnektoren (siehe Tabelle unten). Über die **Suche** findest du zusätzlich weitere Server aus dem offenen MCP-Register.

### 2. Verbinden und autorisieren

Klicke beim gewünschten Dienst auf **Verbinden**. Je nach Dienst passiert eines von drei Dingen:

- **Login-Fenster (OAuth):** Es öffnet sich ein Popup, in dem du dich beim Dienst anmeldest und den Zugriff bestätigst — wie bei „Mit Google anmelden". Kein Kopieren von Schlüsseln nötig.
- **API-Token:** Manche Dienste (z. B. Brevo, HubSpot) arbeiten mit einem API-Token. Der Dialog verlinkt dir die richtige Stelle beim Anbieter; füge den Token ein — er wird **verschlüsselt gespeichert** und nur für deine Anfragen verwendet.
- **Keine Anmeldung:** Einige Dienste (z. B. Yahoo Finance) brauchen gar keine Autorisierung und sind sofort einsatzbereit.

:::tip Status hängt nach dem Login?
Steht ein Dienst nach erfolgreichem Login noch unter **„Autorisierung erforderlich"**, klicke oben auf **Aktualisieren** — die Anzeige holt den aktuellen Stand vom Server. Falls dein Browser das Login-Popup blockiert, erlaube Popups für gruenerator.eu und versuche es erneut.
:::

### 3. Im Chat nutzen

Erwähne den verbundenen Dienst im Chat einfach per `@`-Mention, z. B.:

> _„Erstelle ein Anmeldeformular für unser Sommerfest mit **@tally**"_
>
> _„Fasse die offenen Aufgaben aus **@todoist** zusammen"_
>
> _„Lege die Pressemitteilung als Seite in **@notion** ab"_

Die Mention erscheint als Chip in deiner Nachricht. Auch **Folgefragen ohne erneute Mention** bleiben beim Dienst — nach _„erstelle ein Formular mit @tally"_ versteht der Chat _„füge noch ein Feld für die E-Mail-Adresse hinzu"_ weiterhin als Tally-Auftrag.

## Verfügbare Konnektoren

Das Verzeichnis wird laufend gepflegt — aktuell enthält es unter anderem:

| Kategorie                      | Dienste                                        | Anmeldung        |
| ------------------------------ | ---------------------------------------------- | ---------------- |
| **Produktivität**              | Notion, Coda, monday.com, Todoist, Miro, Jamie | Login-Fenster    |
|                                | Sally                                          | API-Token        |
|                                | Goodnotes                                      | Keine            |
| **Formulare**                  | Tally, Jotform                                 | Login-Fenster    |
| **CRM & Marketing**            | Attio                                          | Login-Fenster    |
|                                | HubSpot, Brevo                                 | API-Token        |
| **Social Media**               | Swat.io (Beta, kein Direkt-Publishing)         | Login-Fenster    |
| **Analyse & SEO**              | Statista, SISTRIX                              | API-Token        |
| **Recht & Compliance**         | Ansvar (EU-Recht mit verifizierten Zitaten)    | Login-Fenster    |
| **Automatisierung**            | Zapier (über 7.000 Apps)                       | API-Token        |
| **Karten / Finanzen / Reisen** | Google Maps (Token), Yahoo Finance, trivago    | Token bzw. keine |

:::info Ein Dienst fehlt?
Einige bekannte Anbieter (z. B. Typeform, Zoom, DocuSign) verlangen aktuell eine eigene App-Registrierung pro Organisation und sind deshalb vorerst nicht im Verzeichnis. Über die Suche und den offenen MCP-Katalog findest du trotzdem viele weitere Server — oder du fügst einen eigenen hinzu.
:::

## Eigenen MCP-Server hinzufügen

Für Dienste außerhalb des Verzeichnisses klicke auf **„Eigenen MCP-Server hinzufügen"** und trage **Name** und **Server-URL** (`https://…/mcp`) ein. Der Grünerator erkennt automatisch, ob der Server eine Anmeldung braucht, und startet bei Bedarf den Login-Flow. Falls der Anbieter eine manuell registrierte App verlangt, kannst du optional **Client-ID** und **Client-Secret** hinterlegen.

## Verwalten, pausieren, trennen

In der Sektion **Verbunden** siehst du alle deine Dienste mit Status (_Verbunden_ / _Pausiert_ / _Nicht autorisiert_). Dort kannst du jeden Konnektor:

- per Schalter **pausieren** (bleibt verbunden, wird im Chat aber nicht genutzt),
- **testen** (zeigt die verfügbaren Werkzeuge des Servers),
- oder **löschen** — gespeicherte Zugangsdaten werden dabei entfernt.

:::info Datenschutz
Zugangsdaten (Tokens) werden verschlüsselt auf EU-Servern gespeichert und ausschließlich für deine eigenen Chat-Anfragen verwendet. Der Zugriff auf einen Dienst erfolgt immer mit **deinem** Konto und dessen Berechtigungen — andere Nutzer\*innen sehen deine Verbindungen nicht.
:::
