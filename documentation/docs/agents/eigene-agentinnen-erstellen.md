---
sidebar_position: 2
---

# Eigene Agent\*innen erstellen

Du kannst dir im Grünerator deine **eigenen Agent\*innen bauen** — ganz ohne technische Vorkenntnisse. Es gibt zwei Wege: per **Beschreibung** (die KI erstellt einen Entwurf) oder **manuell** über das Formular.

:::caution Experimentelles Feature
Eigene Agent\*innen sind noch in der Erprobung. Verhalten und Funktionen können sich ändern, und nicht alles funktioniert schon zuverlässig. Beim Bauen siehst du oben einen entsprechenden Hinweis-Banner. Bitte melde Probleme dem Team.
:::

## Schritt 1: Den Creator öffnen

Öffne die [Agentura](./agentura), scrolle zum Abschnitt **Meine Grüneratoren** und klicke oben rechts auf **Neuer Agent**. Alternativ rufst du den Creator direkt unter `/agents/new` auf.

## Schritt 2: Agent beschreiben (empfohlen)

Du landest auf der Seite **„Was für einen Agent möchtest du bauen?"**. Beschreibe im Eingabefeld (Platzhalter _„Beschreibe deinen neuen Agent…"_) in eigenen Worten, was dein Agent können soll – Zweck, Ton und Fähigkeiten. Zum Einstieg kannst du auch eines der Beispiele anklicken: **📰 Pressestelle**, **🚲 Recherche-Bot** oder **📣 Social Media**.

Drücke anschließend den Senden-Pfeil (oder `Enter`). Der Grünerator erstellt daraus einen Entwurf und öffnet direkt den Editor mit vorausgefüllten Feldern.

:::tip Lieber selbst ausfüllen?
Klicke auf **„Lieber manuell anlegen?"**, um den Editor mit leerem Formular zu öffnen (entspricht der Adresse `/agents/new/manual`).
:::

## Schritt 3: Im Editor anpassen

Der Editor zeigt links das Formular und rechts eine Live-**Vorschau**. Die Felder sind in Tabs gegliedert: **Grundlagen**, **Werkzeuge** und **Wissen** (bei wiederkehrenden Aufgaben zusätzlich **Zeitplan**).

**Pflichtfelder (Tab Grundlagen):**

- **Name** — der Anzeigename deines Agenten. Daneben wählst du über den Icon-Picker ein Symbol.
- **Beschreibung** — ein kurzer Satz, was der Agent macht.
- **Anleitung** — die eigentliche Anweisung an die KI (das „System-Prompt"), z.B. beginnend mit _„Du bist ein\*e …"_. Mindestens 10 Zeichen.

**Tab Werkzeuge** — wähle per Checkbox, was dein Agent können soll. Standardmäßig sind **Grünerator-Wissen** und **Recherche** aktiv. Zur Auswahl stehen:

| Werkzeug                   | Funktion                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| **Grünerator-Wissen**      | Durchsucht die Grünerator-Wissensdatenbank (Programme, Beschlüsse, Kommunalwiki).                  |
| **Recherche**              | Sucht im Web — die Suchtiefe (schnelle Suche bis mehrstufige Recherche) passt sich automatisch an. |
| **Social-Media-Beispiele** | Findet passende Beispiel-Posts aus dem Grünerator-Fundus.                                          |
| **Bildgenerierung**        | Erstellt Bilder aus einer Beschreibung.                                                            |
| **Bildbearbeitung**        | Bearbeitet ein vorhandenes Bild nach Anweisung.                                                    |
| **Bildanalyse**            | Beschreibt und analysiert hochgeladene Bilder.                                                     |
| **Webseiten lesen**        | Liest den Inhalt einer angegebenen URL aus.                                                        |
| **Umfragen**               | Ruft aktuelle Umfragewerte ab.                                                                     |
| **Frühere Chats**          | Durchsucht deine früheren Unterhaltungen.                                                          |
| **Eigene Inhalte**         | Durchsucht die eigenen gespeicherten Texte und Dokumente.                                          |

Darunter im selben Tab:

- **Quell-Links direkt im Antworttext** — für versandfertige E-Mails/Briefe: konkrete Artikel-URLs aus der Recherche erscheinen inline im Text statt nur als Quellen-Karten.

**Tab Wissen** — wähle per Checkbox die Notebooks, die dein Agent automatisch als Wissensquelle durchsucht. **Mehrfachauswahl ist möglich**; zur Auswahl stehen die Gruppen **Grünerator-Notebooks** und – sobald du eigene Notebooks hast – **Meine Notebooks**.

**Aufklappbare Bereiche (optional):**

- **Begrüßung & Startfragen** — ein **Begrüßungstext** und **Beispielfragen** (eine pro Zeile), die beim Öffnen des Agenten angezeigt werden.
- **Erweiterte Einstellungen** — **Region** (Deutschland `de-DE` / Österreich `de-AT`), **Tags** (kommagetrennt) und das **Modell**.

:::tip Erst das Wissen, dann der Agent
Lege dir vorher unter [Notebooks](../notebooks/eigenes-notebook-erstellen) ein eigenes Notebook an und lade eure Dokumente hoch. Im Editor kannst du es dann unter **Wissen → Meine Notebooks** auswählen — und dein Agent antwortet ausschließlich aus euren Quellen, mit nachprüfbaren Quellenangaben.
:::

:::info Wiederkehrende Aufgaben
Du kannst einen Agenten auch als **wiederkehrende Aufgabe** anlegen — er läuft dann automatisch nach Zeitplan (z. B. „jeden Montag eine Presseschau"). Starte dazu die Erstellung aus dem Regal **Wiederkehrende Aufgaben** in der Agentura; im Editor erscheint ein zusätzlicher **Zeitplan**-Tab.
:::

## Schritt 4: Speichern und nutzen

Klicke oben rechts auf **Speichern**. Der Knopf ist erst aktiv, wenn **Name**, **Beschreibung** und **Anleitung** ausgefüllt sind. Nach dem Speichern erscheint **„Gespeichert ✓"** und du landest auf der Bearbeitungsseite deines Agenten.

Von dort öffnest du ihn über **Im Chat öffnen** und kannst sofort mit ihm arbeiten. Spätere Änderungen nimmst du jederzeit über das Stift-Symbol (Bearbeiten) auf der Karte oder Detailseite vor. Mit **Abbrechen** verwirfst du nicht gespeicherte Änderungen.
