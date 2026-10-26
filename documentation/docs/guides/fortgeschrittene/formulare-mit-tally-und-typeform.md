---
laender: [de, at]
sidebar_position: 5
description: 'Mit dem Grünerator-Chat Formulare in Tally oder Typeform anlegen, Felder gezielt ändern und den Entwurf vor der Veröffentlichung prüfen.'
---

# Vom Chat zum Formular: Tally und Typeform mit dem Grünerator nutzen

Eine Anmeldung fürs Sommerfest, eine Workshop-Abfrage oder ein kurzes Feedbackformular: **Beschreibe im Grünerator, was du brauchst, und lass den verbundenen Formulardienst einen Entwurf anlegen.** Anschließend prüfst du das Formular in Tally oder Typeform und passt es an.

Dieser Guide zeigt einen fiktiven Anmeldebogen. Die Chat-Screenshots stammen aus echten Durchläufen mit neu angelegten Demo-Formularen. Bestehende Formulare und Antworten wurden dafür nicht ausgewertet.

:::warning[Experimentelles Feature]
Konnektoren sind experimentell. Ein Auftrag kann mehrere Werkzeugaufrufe und Korrekturen benötigen. Prüfe das Formular selbst, bevor du es veröffentlichst oder den Link teilst.
:::

:::info[Was im Test funktioniert hat]
**Tally:** Der Grünerator hat den Demo-Entwurf und seine Fragen angelegt. Bei Feldregeln war Nacharbeit nötig; die gezeigte Vorschau enthält auch manuelle Korrekturen im Tally-Editor.

**Typeform:** Anmeldung, Konto-/Workspace-Auswahl und Anlage eines leeren Demo-Entwurfs funktionierten. Der weitere Fragenaufbau blieb bei wiederholten Validierungsversuchen hängen und wurde abgebrochen. Ein vollständiges Typeform-Formular aus diesem Chat-Auftrag ist damit noch nicht belegt. Die Typeform-Schritte zeigen den vorgesehenen Weg und die geprüften Freigaben, keinen abgeschlossenen Formularaufbau.
:::

## 1. Den Formulardienst verbinden

Öffne im Grünerator **Account-Menü → Konnektoren** oder **Einstellungen → Konnektoren**. Suche unter **Dienste verbinden** nach deinem Anbieter und klicke auf **Verbinden**. Prüfe im Anmeldefenster, welches Konto du verbindest und welche Berechtigungen angefragt werden.

| Dienst                  | Welchen Eintrag wählst du?                                                   | Anmeldung                                        |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Tally                   | **Tally**                                                                    | Anmeldung bei Tally; alternativ **oder API-Key** |
| Typeform                | **Typeform** für das reguläre Rechenzentrum                                  | Anmeldung bei Typeform                           |
| Typeform mit EU-Hosting | **Typeform (EU – .com)** oder **Typeform (EU – .eu)** passend zu eurem Konto | Anmeldung bei Typeform                           |

Die beiden EU-Einträge sind nicht austauschbar. EU-Hosting wird durch dein Typeform-Konto bestimmt, nicht durch die Sprache oder deinen Wohnort. Wenn du unsicher bist, kläre das mit eurer Administration oder dem Typeform-Support. Einzelheiten stehen in der **[Typeform-Anleitung zur MCP-Verbindung](https://help.typeform.com/hc/en-us/articles/50533862636308-Connect-Typeform-to-your-AI-with-the-Typeform-MCP-server)**.

Nach der Anmeldung erscheint der Dienst unter **Verbunden**. Prüfe **Aktiv** und klicke auf **Testen**. Wenn der Dienst schon verbunden ist, reicht diese Prüfung.

![Aktive Tally- und Typeform-Verbindungen im Grünerator; sichtbar sind nur Konnektoren und öffentliche Serveradressen](/img/guides/formulare/formular-konnektoren.jpg)

### Tally alternativ mit einem API-Key verbinden

Öffne in Tally **Settings → API keys**. Dort kannst du über **Create API key** einen eigenen Schlüssel anlegen. Verwende einen erkennbaren Namen wie „Grünerator“ und bewahre den einmalig angezeigten Schlüssel sicher auf. Die **[Tally-API-Anleitung](https://tally.so/help/api)** verlinkt die Schlüsselverwaltung.

![Tally-Einstellungen mit ausgewähltem Tab API keys und dem Einstieg Create API key; ohne persönliche Kontodaten oder Schlüssel](/img/guides/formulare/tally-api-key-einstellungen.jpg)

Wähle im Grünerator beim Tally-Eintrag **oder API-Key**. In **API-Token einfügen** gehört nur der vollständige Schlüssel, ohne `Bearer`. Klicke auf **Verbinden**. Füge den Schlüssel niemals als Chatnachricht ein. Für die Screenshots wurde kein neuer Schlüssel erzeugt.

Bei **Typeform** nutzt du die Anmeldung beim Dienst. Persönliche API-Tokens sind für dessen aktuelle MCP-Verbindung kein Ersatz für diesen Anmeldeweg.

## 2. Im Chat einen klaren Formularauftrag geben

Öffne einen neuen Grünerator-Chat, tippe `@tally` und wähle **Tally** aus den Vorschlägen. Die Auswahl erscheint als Chip. Für Typeform tippst du `@typeform` und wählst den tatsächlich verbundenen Eintrag; bei einem EU-Konto trägt auch die Mention den entsprechenden Zusatz.

Ein guter Auftrag nennt Titel, Zweck, Felder, Pflichtangaben, Auswahlmöglichkeiten und den gewünschten Status:

> Erstelle mit @tally ein neues Formular als unveröffentlichten Entwurf mit dem Titel „Demo – Anmeldung zum Sommerfest“. Einleitung: „Fiktives Beispiel für einen Grünerator-Guide.“ Felder: Vorname und E-Mail als Pflichtangaben; Anzahl der teilnehmenden Personen von 1 bis 5 als Pflichtangabe; freiwillige Hilfe mit Aufbau, Infostand und Abbau als optionale Mehrfachauswahl. Dankeseite: „Danke für deine Anmeldung!“ Ändere keine bestehenden Formulare und rufe keine Antworten ab. Nicht veröffentlichen und keine Benachrichtigungen versenden. Zeige mir danach den Bearbeitungslink.

**Für Typeform:** Wähle stattdessen die Typeform-Mention und verwende denselben Formularinhalt. Bei mehreren Konten oder Workspaces gib an, wo das neue Formular entstehen soll. Der Chat kann dafür zunächst Konto- und Workspace-Metadaten abrufen.

## 3. Die vorgeschlagenen Aktionen prüfen

Bevor ein Werkzeug ausgeführt wird, kann der Chat eine Freigabe anzeigen. Öffne **Übergabewerte anzeigen** und kontrolliere, ob die Aktion zum Auftrag passt. Mit **Einmal erlauben** erlaubst du genau diesen Aufruf.

![Tally-Auftrag im Chat und einmalige Freigabe für create_new_form mit dem neutralen Demo-Titel](/img/guides/formulare/tally-chat-freigabe.jpg)

Ein Formular kann in mehreren Schritten entstehen: erst der Entwurf, dann Fragen, Antwortoptionen und Einstellungen. Warte deshalb auf den Abschluss und prüfe weitere Rückfragen. Die Anlage eines leeren Formulars bedeutet noch nicht, dass alle Fragen fertig sind.

Bei Typeform können zusätzlich Aufrufe zum Ermitteln der unterstützten Feldtypen und zum Validieren der Änderungen erscheinen. Diese Prüfungen gehören zum Aufbau des Entwurfs. Das Veröffentlichen ist ein eigener Schritt; siehe **[Typeforms Ablauf für Formularänderungen](https://www.typeform.com/developers/mcp/core-concepts/)**.

![Typeform im Grünerator-Chat: getrennte Freigaben zum Anlegen des Demo-Formulars und zum Abrufen der unterstützten Formularfunktionen](/img/guides/formulare/typeform-chat-freigabe.jpg)

**Passt ein Aufruf nicht?** Wähle **Ablehnen** und beschreibe die gewünschte Korrektur. Schlägt der Chat wiederholt dieselbe unpassende Aktion vor, stoppe den laufenden Auftrag über **Abbrechen** und stelle eine neue, klar eingegrenzte Anfrage mit ausdrücklich ausgewähltem Konnektor.

## 4. Den Entwurf öffnen und verbessern

Öffne den Bearbeitungslink aus der Antwort oder das neue Demo-Formular direkt beim Anbieter. Prüfe die tatsächlichen Felder; verlasse dich nicht allein auf die Zusammenfassung im Chat.

![Vorschau des durch den Grünerator angelegten Tally-Demoformulars mit fiktiven Inhalten und zwei ausgewählten Hilfe-Optionen](/img/guides/formulare/tally-formular-vorschau.jpg)

_Die Fragen stammen aus dem Chat-Auftrag. Die optionale Helfer\*innen-Frage und die Zahlenbegrenzung wurden für diese Vorschau anschließend im Tally-Editor nachgearbeitet. Aufbau und Abbau sind gleichzeitig ausgewählt; es wurde keine Antwort abgeschickt._

![Tally-Editor mit dem neutralen Demo-Titel und dem Status Draft vor dem Veröffentlichen](/img/guides/formulare/tally-entwurf-status.jpg)

Kontrolliere besonders:

- **Pflichtfelder:** Vorname, E-Mail und Personenanzahl sind Pflicht; freiwillige Hilfe ist optional.
- **Eingaben:** Die Personenanzahl erlaubt nur 1 bis 5. Ein Platzhalter „1–5“ allein setzt noch keine Begrenzung.
- **Mehrfachauswahl:** Aufbau und Abbau können gemeinsam ausgewählt werden.
- **Texte:** Titel, Einleitung, Fragen und Dankeseite passen zur Veranstaltung.
- **Status:** Der Entwurf ist noch nicht veröffentlicht.

Korrekturen kannst du gezielt im Chat anfordern. Wähle den Dienst dafür erneut über `@` aus und nenne den bestehenden Entwurf eindeutig, etwa mit seinem Bearbeitungslink:

> Ändere mit @tally ausschließlich den eben erstellten Entwurf „Demo – Anmeldung zum Sommerfest“ unter [Bearbeitungslink]. Die Frage „Freiwillige Hilfe“ soll optional sein. Die Personenanzahl muss auf 1 bis 5 begrenzt sein. Lege kein neues Formular an und veröffentliche nichts.

Für Typeform kannst du denselben Folgeauftrag mit der passenden Typeform-Mention versuchen; der vollständige Aufbau war in unserem Test noch nicht erfolgreich. Falls eine Änderung nicht gelingt, kannst du sie im Formular-Editor vornehmen. Im Test waren Korrekturen und mehrere Freigaben nötig; der erste Auftrag war kein verlässlich fertiges Formular.

## 5. Testen, dann veröffentlichen

Nutze die Vorschau beim Formulardienst. Prüfe leere Pflichtfelder, ungültige E-Mail-Adressen, die erlaubte Personenanzahl und mehrere ausgewählte Helfer*innen-Aufgaben. Nutze für einen Test ausschließlich fiktive Angaben.

Ergänze vor dem Einsatz eure Veranstaltungsinformationen und die passenden Hinweise zur Datenverarbeitung. Der Demo-Entwurf enthält dafür noch keinen fertigen Text. Plane auch, wer auf Antworten zugreifen soll.

Wenn Inhalt und Einstellungen stimmen, veröffentlichst du das Formular bewusst im jeweiligen Dienst und übernimmst dessen Teilnahme-Link. Teile den **Teilnahme-Link**, nicht den Bearbeitungslink. Die für diesen Guide angelegten Demo-Formulare wurden nicht veröffentlicht.

## Wenn etwas nicht klappt

| Problem                                        | Nächster Schritt                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Der Chat liefert nur einen Textvorschlag       | Wähle den verbundenen Dienst über `@` aus und fordere ausdrücklich einen Entwurf in diesem Dienst an.       |
| Es gibt nur einen leeren Entwurf               | Prüfe, ob weitere Freigaben für Felder oder Einstellungen ausstehen.                                        |
| Eine Pflichtangabe oder Auswahl stimmt nicht   | Nenne das betroffene Feld und die gewünschte Änderung; lasse nur den vorhandenen Entwurf ändern.            |
| Der Chat will noch einmal ein Formular anlegen | Lehne die Doppelanlage ab. Stoppe den Lauf und verweise in einer neuen Anfrage auf den bestehenden Entwurf. |
| Typeform meldet Konto- oder Zugriffsprobleme   | Prüfe verbundenes Konto, Workspace und den zum Rechenzentrum passenden Eintrag.                             |
| Eine Typeform-Funktion ist nicht verfügbar     | Prüfe die Meldung des Dienstes; manche Funktionen hängen vom Tarif und den Kontoberechtigungen ab.          |

## Weiterlesen

- **[Konnektoren einrichten](./konnektoren-einrichten.mdx)**: Verbindung, Test und Werkzeugfreigaben im Grünerator.
- **[Tally MCP](https://tally.so/help/mcp)**: Funktionen und Anmeldung auf Anbieter-Seite.
- **[Typeform MCP](https://help.typeform.com/hc/en-us/articles/50533862636308-Connect-Typeform-to-your-AI-with-the-Typeform-MCP-server)**: Einrichtung und Rechenzentren.
- **[Sally mit dem Grünerator nutzen](./sally-meetings-transkribieren.md)**: aus Gesprächsinhalten Protokolle und nächste Schritte machen.

_Am 26. Oktober 2026 mit fiktiven Inhalten geprüft. Screenshots zeigen ausschließlich Einrichtungsbereiche und die neu angelegten Demo-Formulare; persönliche Kontodaten, Schlüssel und echte Antworten sind ausgeschnitten._
