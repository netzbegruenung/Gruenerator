---
laender: [de, at]
sidebar_position: 4
description: 'Videokonferenzen mit Sally transkribieren und im Grünerator daraus Protokolle, Aufgaben und Briefings erstellen.'
---

# Von der Videokonferenz zum Protokoll: Sally mit dem Grünerator nutzen

Die Sitzung ist vorbei – aber das Protokoll und die Aufgabenliste fehlen noch? **Sally übernimmt die Aufzeichnung und Transkription. Im Grünerator verarbeitest du die Gesprächsinhalte weiter**, etwa zu einem Ergebnisprotokoll, einem Briefing für den nächsten Termin oder einem Textentwurf.

Dieser Guide zeigt den Weg über den **Sally-Konnektor im Grünerator-Chat**. Du verbindest beide Dienste einmalig und rufst anschließend gezielt die benötigten Gesprächsinhalte ab.

:::warning[Experimentelles Feature]
Konnektoren sind derzeit experimentell. Anmeldung, verfügbare Werkzeuge und Oberfläche können sich ändern.
:::

## Was du brauchst

- Ein Grünerator-Konto und ein Sally-Konto.
- Zugriff auf die gewünschte Aufzeichnung in Sally.
- Eine Freigabe für Sally MCP in eurem Sally-Unternehmenskonto; bei Bedarf hilft eure Administration.
- Eine mit den Beteiligten abgestimmte Aufzeichnung und Weiterverarbeitung. Klärt vorab, welche Gesprächsinhalte in Sally und im Grünerator verarbeitet werden dürfen.

## 1. Die Videokonferenz in Sally transkribieren

Wähle in Sally einen passenden Aufnahmeweg:

- **Mit Kalenderanbindung:** Sally kann geplanten Online-Meetings automatisch beitreten.
- **Für einen einzelnen Termin:** Über **Sally einladen** lädst du Sally zum Meeting ein.
- **Bei vorhandener Aufnahme:** Über **Datei hochladen** übergibst du eine Audio- oder Videodatei zur Verarbeitung.

Die Aufnahme richtest du in Sally ein. Die einzelnen Wege beschreibt Sally unter **[Meetings aufzeichnen](https://help.sally.io/de/guides/meetings-aufzeichnen/uebersicht/)**.

Warte anschließend, bis das Transkript in Sally vorliegt. Prüfe besonders Namen, Fachbegriffe, Zahlen und die Zuordnung der Sprecher*innen. Korrekturen am Ausgangstext verbessern auch das spätere Protokoll. Hilfe bietet **[Transkripte in Sally](https://help.sally.io/de/guides/transkripte/uebersicht/)**.

## 2. Sally mit dem Grünerator verbinden

1. Öffne im Grünerator dein **Account-Menü → Konnektoren**. Du erreichst denselben Bereich über **Einstellungen → Konnektoren**.
2. Suche unter **Dienste verbinden** nach **Sally**.
3. Klicke auf **Verbinden**. Melde dich im Sally-Fenster an und prüfe die angefragte Freigabe.
4. Achte bei mehreren Sally-Unternehmenskonten darauf, welches Konto du freigibst.
5. Prüfe danach im Grünerator unter **Verbunden**, ob Sally **Aktiv** ist. Klicke auf **Testen**.

Bei erfolgreicher Verbindung zeigt der Grünerator die verfügbaren Werkzeuge an. Die Anzahl kann sich ändern. Ist Sally bereits verbunden, kannst du direkt mit dem Test beginnen.

![Sally-Konnektor im Grünerator mit aktivierter Verbindung und erfolgreichem Test; sichtbar sind ausschließlich Serveradresse und Werkzeugnamen](/img/guides/sally/gruenerator-sally-verbindung.jpg)

_Der Verbindungstest prüft die Erreichbarkeit der Werkzeuge. Ob eine bestimmte Aufzeichnung abrufbar ist, zeigt erst die gezielte Anfrage im Chat._

Für diesen Weg musst du keinen Schlüssel kopieren. Weitere Grundlagen findest du unter **[Konnektoren einrichten](./konnektoren-einrichten.mdx)**.

### Alternative: Einen Sally-Schlüssel verwenden

Falls die Anmeldung nicht funktioniert oder du gezielt einen Schlüssel verwenden möchtest, bietet der Sally-Eintrag im Grünerator **oder API-Key** an.

1. Öffne in Sally **Einstellungen → Integrationen → MCP**.
2. Wähle im Bereich **Sally MCP** den Button **Token erstellen**. Der benachbarte Reiter **Personal Access Token** ist ein anderer Bereich.

![Sally-Einstellungen: Integrationen mit ausgewähltem Reiter MCP und dem Button Token erstellen; Kontodaten und vorhandene Tokens sind ausgeschnitten](/img/guides/sally/sally-mcp-einstellungen.jpg)

3. Gib einen erkennbaren Namen ein, etwa **Grünerator**, und lege bei Bedarf ein Ablaufdatum fest.

![Sally MCP-Token erstellen: neutraler Beispielname Grünerator und optionales Ablaufdatum, ohne erzeugten Schlüssel](/img/guides/sally/sally-token-dialog.jpg)

4. Klicke auf **Erstellen** und kopiere den einmalig angezeigten Token.
5. Öffne im Grünerator beim Sally-Eintrag **oder API-Key**, füge den vollständigen Token in **API-Token einfügen** ein und klicke auf **Verbinden**. In dieses Feld gehört nur der Token, ohne den Zusatz `Bearer`.

Bewahre den Schlüssel wie ein Passwort auf und füge ihn ausschließlich in das dafür vorgesehene Verbindungsfeld ein. Für die Screenshots wurde kein neuer Schlüssel erstellt. Sally beschreibt die Anmeldung und Token-Verwaltung im **[allgemeinen MCP-Setup](https://help.sally.io/de/guides/integrationen/allgemeines-setup/)**.

## 3. Das richtige Gespräch auswählen

Öffne einen neuen Grünerator-Chat. Tippe `@sally` und wähle Sally aus den Vorschlägen, sodass die Mention als Chip erscheint. Grenze die Suche ein, statt sofort alle Gespräche abrufen zu lassen.

> Suche mit @sally nach dem Meeting „Planung Sommerfest“ vom 20. Oktober 2026. Zeige mir zunächst nur die passenden Termine mit Datum und Titel. Rufe noch keine vollständigen Transkripte ab.

Alle Beispiele in diesem Guide sind fiktiv. Ersetze Titel, Datum und Thema durch deine Angaben. Bei mehreren Treffern legst du zuerst fest, welches Gespräch gemeint ist.

> Verwende den zweiten Treffer. Hole die Zusammenfassung und das Transkript dieser Aufzeichnung. Erstelle ein Ergebnisprotokoll mit den Abschnitten Beschlüsse, offene Fragen und nächste Schritte. Trenne beschlossene Punkte von bloßen Vorschlägen. Ergänze zu wichtigen Aussagen Zeitstempel, soweit die Quelle sie enthält. Erfinde keine Angaben.

Prüfe die Werkzeuganfragen im Chat, bevor du sie freigibst. Die im Screenshot sichtbaren Werkzeuge umfassen neben Such- und Abruffunktionen auch Aktionen zum Ändern von Daten. Für ein Protokoll brauchst du zunächst nur die passenden Such- und Lesewerkzeuge; kontrolliere daher die konkrete Aktion und ihre Übergabewerte.

## 4. Aus dem Transkript Arbeitsmaterial machen

Gib dem Grünerator ein klares Ausgabeformat und Regeln für fehlende Angaben. Diese Folgeaufträge bauen auf dem ausgewählten Gespräch auf:

### Aufgabenliste für die Nachbereitung

> Erstelle aus diesem Gespräch eine Tabelle mit Aufgabe, verantwortlicher Person, Frist und Belegstelle. Übernimm nur ausdrücklich vereinbarte Aufgaben. Wenn Person oder Frist fehlen, schreibe „nicht festgelegt“. Lege noch keine Aufgaben in einem externen Dienst an.

### Briefing für den Folgetermin

> Erstelle ein kurzes Briefing für die nächste Besprechung: bisherige Beschlüsse, offene Fragen und Punkte, zu denen wir eine Entscheidung brauchen. Kennzeichne deine Empfehlungen als Vorschläge und trenne sie von Aussagen aus dem Gespräch.

### Textentwurf aus besprochenen Inhalten

> Entwirf aus den besprochenen Ergebnissen einen kurzen Bericht für unsere Mitglieder. Verwende keine persönlichen Wortbeiträge oder internen Konflikte. Markiere Aussagen, deren Freigabe oder sachliche Prüfung noch fehlt. Gib nur einen Entwurf aus.

Kontrolliere vor der Weitergabe besonders Beschlüsse, Zuständigkeiten und Fristen anhand des Transkripts. Ein gut formulierter Text ist noch kein freigegebenes Protokoll. Wörtliche Zitate solltest du zusätzlich mit der Aufnahme abgleichen.

## Wenn etwas nicht klappt

| Problem                                                  | Nächster Schritt                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Sally ist verbunden, wird im Chat aber nicht genutzt     | Prüfe **Aktiv** und wähle Sally ausdrücklich über die `@`-Vorschläge aus.                                                        |
| Die Anmeldung öffnet sich nicht                          | Erlaube Pop-ups für den Grünerator und starte **Verbinden** erneut.                                                              |
| Der Token wird abgelehnt                                 | Prüfe Vollständigkeit und Ablaufdatum. Verwende den Token aus **Integrationen → MCP** ohne `Bearer` im Grünerator-Feld.          |
| **Token erstellen** fehlt oder Sally MCP ist deaktiviert | Lass die Freigabe im Sally-Unternehmenskonto durch eure Administration prüfen.                                                   |
| Das Gespräch wird nicht gefunden                         | Prüfe Titel, Zeitraum, Unternehmenskonto und deinen Zugriff direkt in Sally. Suche zunächst nach wenigen markanten Stichwörtern. |
| Die Zusammenfassung lässt einen wichtigen Punkt aus      | Bitte ausdrücklich um Prüfung des Transkripts und um eine Belegstelle.                                                           |

## Weiterführende Anleitungen

- **[Konnektoren einrichten](./konnektoren-einrichten.mdx)** erklärt Verbindung, Werkzeugfreigaben und Verwaltung im Grünerator.
- **[Sally: Allgemeines MCP-Setup](https://help.sally.io/de/guides/integrationen/allgemeines-setup/)** beschreibt die Einrichtung auf Sally-Seite.
- **[Grünerator mit ChatGPT & Co. verbinden](./gruenerator-mit-ki-chat-verbinden.md)** beschreibt den umgekehrten Weg: Grünerator-Funktionen in einem anderen KI-Chat verwenden.

_Oberflächen und Sally-Verbindung am 26. Oktober 2026 geprüft. Die Screenshots zeigen ausschließlich Einrichtung und Konnektorstatus; persönliche Kontodaten, Meetinginhalte und vorhandene Schlüssel sind nicht abgebildet._
