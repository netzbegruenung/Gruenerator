---
sidebar_position: 8
title: Wie diese Doku entsteht
description: 'Diese Doku entsteht größtenteils am Quellcode: welcher Teil maschinell ausgelesen ist, welcher von einer KI geschrieben wurde.'
---

# Wie diese Doku entsteht

Diese Dokumentation beschreibt ein Werkzeug, das sich fast wöchentlich ändert. Damit die Beschreibung nicht still veraltet, entsteht sie größtenteils direkt am Quellcode des Grünerators — die Aufzählungen werden maschinell aus ihm ausgelesen, die erklärenden Texte zum überwiegenden Teil von einer KI geschrieben, die den Code dabei mitliest. Weil das eine ungewöhnliche Arbeitsweise ist, steht hier offen, welcher Teil woher kommt.

:::info[Kurz gesagt]

**Der größte Teil dieser Doku ist von einer KI geschrieben** — beauftragt, gegengelesen und freigegeben von Menschen. Die Listen darin stammen nicht aus der KI, sondern werden Wort für Wort aus dem Quellcode ausgelesen.

:::

## Drei Schichten, drei Verfahren

| Schicht                                                                        | Wer macht es                                                                                                     | Kann es sich irren?                                                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Listen und Namen** — Werkzeuge, Einstellungen, Chat-Fähigkeiten, Dateilimits | Ein Programm liest den Quellcode aus. Keine KI beteiligt.                                                        | Nein. Es steht wörtlich das da, was im Code steht — oder der Bau der Seite schlägt fehl. |
| **Erklärender Text** — Anleitungen, Beispiele, Einordnungen                    | Überwiegend eine KI, die den Quellcode mitliest. Ein Mensch beauftragt, liest gegen und gibt frei.               | Ja. Text kann danebenliegen oder veralten.                                               |
| **Prüfung** — Stimmt der Text noch mit der App überein?                        | Eine zweite KI, die nur lesen darf: Sie vergleicht Artikel und Code und meldet Abweichungen, ändert aber nichts. | Ja. Sie meldet Verdachtsfälle, entscheiden tun Menschen.                                 |

Die zweite und die dritte Zeile sind bewusst getrennt. Beim Schreiben arbeitet die KI in einer beauftragten Sitzung: Ein Mensch gibt vor, was dokumentiert werden soll, die KI liest den zugehörigen Code und formuliert; veröffentlicht wird erst, wenn ein Mensch die Änderung geprüft und übernommen hat. **Nichts davon geht ungelesen online.**

Die Prüf-KI dagegen läuft unbeaufsichtigt nach Zeitplan — und darf deshalb ausschließlich lesen. Sie hat kein Schreibrecht auf die Dateien und kann nichts veröffentlichen; was sie findet, wird zu einer Aufgabe für einen Menschen.

## Was direkt aus dem Code kommt

Für die Teile, die reine Aufzählung sind, gibt es keine abgetippte Kopie in der Doku. Ein Skript liest die Konfigurationsdateien des Grünerators und schreibt daraus eine Datenliste, die die Doku-Seite beim Bauen einbindet:

| Was                                               | Woraus                                                                        | Wo du es siehst                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Werkzeuge und ihre Gruppen                        | Die Kachel- und Katalog-Konfiguration der Weboberfläche                       | [Alle Werkzeuge](/docs/basics/tools)                                                                 |
| Chat-Fähigkeiten                                  | Die Liste der Absichten, die der Chat erkennen kann, plus die @-Erwähnungen   | [Was kann ich fragen?](/docs/chat/was-kann-ich-fragen)                                               |
| Einstellungen                                     | Der Aufbau des Einstellungen-Dialogs und alle Schalter darin                  | [Einstellungen](/docs/konto/einstellungen)                                                           |
| Office-Funktionen                                 | Die Verträge zwischen App und KI — und was der Editor davon wirklich ausführt | [Office-Überblick](/docs/features/office)                                                            |
| Dateilimits, Sammlungen, Konnektoren              | Die Upload-Prüfung und die Konnektor-Registry                                 | [Dateien hinzufügen](/docs/chat/dateien-hinzufuegen), [Konnektoren](/docs/integrationen/konnektoren) |
| Regale der Agentura                               | Der Kategorien-Katalog des Marktplatzes                                       | [Agentura](/docs/features/agentura)                                                                  |
| Namen von Werkzeugen und Menüpunkten im Fließtext | Dieselben Konfigurationen                                                     | überall dort, wo ein Name genannt wird                                                               |

Zwei Eigenschaften dieses Verfahrens sind entscheidend:

- **Es wird nichts geraten.** Das Skript liest den Code als Struktur, so wie ein Editor das tut, und übernimmt nur Zeichenketten daraus. Die App selbst wird dabei nie ausgeführt.
- **Veraltung bricht den Bau.** Wird im Grünerator ein Werkzeug umbenannt und die Liste nicht neu erzeugt, schlägt die Prüfung im Pull Request fehl. Eine falsche Bezeichnung kann hier nicht unbemerkt online gehen.

Was das Verfahren _nicht_ leistet: Es beschreibt, was die App anbietet — nicht, ob es gut funktioniert oder wann man es benutzen sollte. Deshalb steht neben jeder ausgelesenen Liste geschriebener Text: Beispielfragen, Hinweise, Einordnung. Das ist die Hälfte aus der zweiten Zeile der Tabelle — meist von der KI formuliert, immer von einem Menschen freigegeben.

## Was die KI prüft

Ein Knopfname lässt sich maschinell abgleichen, ein Erklärabsatz nicht — er kann veralten, ohne dass ein einziges Wort im Code fehlt. Deshalb bekommt der geschriebene Teil eine eigene, wiederkehrende Prüfung:

- **Jeden Freitagmorgen** geht ein KI-Agent alle Anleitungsartikel durch. Er liest den Artikel, sucht die passenden Stellen im Quellcode und beantwortet eine Frage: Gibt es diesen Knopf, dieses Menü, diesen Ablauf noch so, wie der Text es behauptet?
- **Bei Änderungen am Code** läuft dieselbe Prüfung sofort — allerdings nur für die Artikel, die zum geänderten Bereich gehören. Das Ergebnis erscheint als Kommentar am Änderungsvorschlag, noch bevor er übernommen wird.
- **Jeder Befund nennt Belege**: die zitierte Stelle aus dem Artikel, die dazugehörige Stelle im Code und einen Vorschlag. Daraus wird eine Aufgabe auf GitHub, öffentlich einsehbar.

Der Agent arbeitet mit einem Sprachmodell der Claude-Familie und ist auf Lesewerkzeuge beschränkt: Dateien lesen, Text suchen, Dateien finden. Schreiben, Befehle ausführen und ins Internet gehen kann er nicht.

Nicht geprüft werden Bereiche, denen kein Code gegenübersteht: das Newsletter-Archiv, die Grundlagenartikel über KI im Allgemeinen und interne Ablagen.

## Was blockiert und was nur meldet

Nicht jede Abweichung wiegt gleich schwer, deshalb gibt es zwei Härtegrade:

**Blockierend** — die Änderung kann nicht übernommen werden:

- Eine ausgelesene Liste ist veraltet.
- Im Text steht ein Werkzeugname, den es im Code nicht mehr gibt.
- Ein Artikel wurde hinzugefügt oder umbenannt, ohne das Verzeichnis nachzuziehen, das der Chat für seine Quellenangaben nutzt.

**Nur meldend** — es entsteht eine Aufgabe, aber nichts steht still:

- Eine neue Fähigkeit ist im Code da, aber noch nirgends beschrieben.
- Der KI-Agent hält eine Textstelle für veraltet.

Die Trennung ist Absicht: Eine neue Funktion im Grünerator soll nicht daran scheitern, dass der passende Doku-Absatz noch fehlt. Umgekehrt soll ein nachweislich falscher Name gar nicht erst online gehen.

## Grenzen

- Ein von einer KI geschriebener Absatz kann flüssig klingen und trotzdem falsch sein. Das Gegenlesen durch Menschen und die wöchentliche Prüfung fangen vieles ab, aber nicht alles.
- Der KI-Agent kann sich irren — in beide Richtungen. Er meldet manchmal etwas, das in Ordnung ist, und er übersieht manchmal etwas. Er ist eine zusätzliche Sicherung, keine Garantie.
- Zwischen zwei Prüfungen liegt bis zu eine Woche. Direkt nach einer Änderung am Grünerator kann ein Absatz kurzzeitig veraltet sein.
- Screenshots werden nicht automatisch geprüft. Ältere Bilder zeigen deshalb manchmal noch frühere Bezeichnungen.

Wenn dir etwas auffällt, das nicht mehr stimmt: [melde es auf GitHub](https://github.com/netzbegruenung/Gruenerator/issues/new) oder schreib uns. Das ist immer noch der schnellste Weg — die Automatik ersetzt keine aufmerksamen Leserinnen und Leser.

## Selbst nachsehen

Der gesamte Grünerator ist quelloffen, dieses Verfahren also auch. Die Skripte, die den Code auslesen, liegen unter [`documentation/scripts/`](https://github.com/netzbegruenung/Gruenerator/tree/master/documentation/scripts), die Prüfung unter [`apps/api/check-docs-freshness.ts`](https://github.com/netzbegruenung/Gruenerator/blob/master/apps/api/check-docs-freshness.ts), die zugehörigen Abläufe in [`.github/workflows/`](https://github.com/netzbegruenung/Gruenerator/tree/master/.github/workflows) (alle Dateien, die mit `docs-` beginnen).

Diese Seite ist die Kennzeichnung, die wir selbst für richtig halten: offenlegen, wo KI im Spiel war, statt es zu verschweigen. Wie das für deine eigenen Texte aussieht, steht im [Kennzeichnungs-Guide](/docs/basics/Kennzeichnungs-Guide).
