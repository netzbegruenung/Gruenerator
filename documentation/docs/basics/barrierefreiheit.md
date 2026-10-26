---
laender: [de, at]
sidebar_position: 6
title: Barrierefreiheit
description: 'Wie barrierefrei der Grünerator heute ist, einschließlich der Stellen, an denen er es noch nicht ist. Stand: 26. Oktober 2026.'
---

# Barrierefreiheit

Diese Seite sagt, wie barrierefrei der Grünerator heute ist — einschließlich der Stellen, an denen er es **noch nicht** ist. Eine geschönte Liste hilft niemandem: Wer auf eine Barriere stößt, die hier nicht steht, verliert Zeit mit der Frage, ob es an ihm liegt.

**Stand: 26. Oktober 2026.**

## Was wir anstreben

Zielstandard ist **WCAG 2.2, Konformitätsstufe AA**, im Rahmen der europäischen Norm **EN 301 549**. Diese Norm haben wir gewählt, weil sie als einzige auch die Mobil-App abdeckt — WCAG allein gilt für Webseiten.

## Der aktuelle Stand: teilweise konform

Behoben und nachgemessen sind unter anderem:

- **Die eingeklappte Hauptnavigation.** Sie war mit Screenreader unbenutzbar — die Beschriftungen der Knöpfe waren nicht nur unsichtbar, sondern vollständig aus der Vorlesereihenfolge entfernt. Das war mit Abstand die schwerste Barriere.
- **Die Tastaturfalle im Untertitel-Werkzeug.** Die Tabulatortaste kam aus der Segmentliste nicht mehr heraus. Jetzt wechseln die Pfeiltasten das Segment, und Tab bleibt Tab.
- **Aufgabenkarten auf Boards** haben einen echten Ziehgriff, der per Tastatur bedienbar ist. Ziehen mit der Maus funktioniert weiter auf der ganzen Karte.
- **Weißer Text auf den Markenfarben** erreichte den geforderten Kontrast nicht. Das betraf den Marken-Button und alle Abzeichen in Eukalyptus-Grün.
- **Graue Textstufen** erreichen jetzt in hellem wie dunklem Modus die geforderten 4,5:1.
- **Die Initialen im Avatar** (sichtbar, solange kein Bild hinterlegt ist) standen weiß auf einem Grün mit 3,73:1. Sie erreichen jetzt 7,24:1.
- **Rund 300 Bedienelemente der Mobil-App** hatten keinen vorlesbaren Namen — mit Screenreader hörte man nur „Schaltfläche", ohne zu erfahren, welche. Alle haben jetzt einen.
- **Der Sharepic- und Canvas-Editor** ist ohne Maus bedienbar, siehe den eigenen Abschnitt weiter unten.

## Was noch nicht erfüllt ist

- **Statusmeldungen werden kaum angesagt.** Wenn eine Chat-Antwort beginnt oder endet, ein Werkzeug arbeitet, ein Upload fertig wird oder ein Formular einen Fehler meldet, erfährt ein Screenreader das in den meisten Fällen nicht. Das ist derzeit die größte offene Lücke.
- **Videos haben keine Untertitelspur.** Der Grünerator kann Untertitel erzeugen, verlangt sie aber bei eingebetteten Videos nicht.
- **Einzelne Farbpaare liegen weiter unter dem geforderten Wert** — bekannt sind ein Blau-auf-Blau-Paar im Bereich _Projekte_, das weiße Herz-Symbol auf grünem Grund bei gemerkten Vorlagen und Stellen im dunklen Modus, an denen das Primärgrün noch zu wenig Kontrast bietet.
- **Die Seitenstruktur ist uneinheitlich.** Nicht jede Seite kennzeichnet ihren Hauptbereich und ihre Navigationsleisten so, dass ein Screenreader direkt dorthin springen kann.
- **Die Mobil-App ist nicht auf einem Gerät geprüft.** Die Namen der Bedienelemente sind gesetzt, aber Kontrast, Reihenfolge beim Durchtippen und die tatsächlichen Ansagen von VoiceOver und TalkBack sind ungeprüft.
- **Der Sharepic- und Canvas-Editor zeigt seine Fläche nur als Bild.** Die Fläche ist gezeichnet; ein Screenreader bekommt den Inhalt über die Ebenen-Liste und die Kurzbeschreibung der Seite, nicht aus den Pixeln. Wie ein Motiv aussieht, Farben und Anordnung eingeschlossen, sagen sie nicht.
- **Alternativtexte gibt es im Editor für das fertige Bild, nicht je Seite.** Bei mehrseitigen Entwürfen gilt ein Text für das Ganze.
- **Nicht gemessen wurden bisher:** die veröffentlichten Kandidat:innen-Seiten, die Desktop-App und diese Dokumentationsseite selbst.

## Einstellungen, die du selbst setzen kannst

Unter **Einstellungen → Datenschutz & Barrierefreiheit**, im unteren Abschnitt _Barrierefreiheit_:

| Einstellung                          | Wirkung                                     |
| ------------------------------------ | ------------------------------------------- |
| Animationen reduzieren               | Bewegung und Übergänge werden abgeschaltet. |
| Transparenz und Unschärfe reduzieren | Durchscheinende Flächen werden deckend.     |

Hellen und dunklen Modus stellst du unter **Einstellungen → Allgemein** ein; der Grünerator folgt sonst der Einstellung deines Systems.

## Tastaturbedienung

Der Grünerator ist weitgehend mit der Tastatur bedienbar, aber nicht überall: Die Fläche des Sharepic- und Canvas-Editors ist ein gezeichnetes Bild, und freies Positionieren mit der Maus hat dort nur Ersatzwege (siehe unten). Mit **Tab** wanderst du vorwärts durch die Bedienelemente, mit **Umschalt+Tab** zurück, **Enter** und **Leertaste** lösen aus, **Escape** schließt Dialoge.

In Listen mit vielen gleichartigen Einträgen — etwa den Segmenten im Untertitel-Werkzeug — wechseln die **Pfeiltasten** innerhalb der Liste; Tab führt aus der Liste heraus.

## Sharepic- und Canvas-Editor

Der Editor zeichnet seine Fläche auf eine Leinwand. Damit er trotzdem ohne Maus und mit Screenreader nutzbar ist, gibt es zu allem Sichtbaren einen Zwilling im Bedienbaum.

**Was per Tastatur geht:**

- **Sprunglink „Zu den Ebenen":** Er ist früh in der Tab-Reihenfolge und öffnet die Ebenen-Liste.
- **Ebenen-Liste:** Sie führt alle Elemente der Seite, vorn zuerst. Pfeiltasten, Pos1 und Ende wählen, Leertaste schaltet die Auswahl um, Umschalt erweitert sie. **Enter** oder **F2** bearbeitet den Text beziehungsweise tauscht das Bild eines Rahmens.
- **Textbearbeitung:** Der Texteditor trägt einen Namen, **Escape** schließt ihn, und der Fokus kehrt an die Stelle zurück, an der die Bearbeitung begann.
- **Verschieben:** **Alt+Pfeiltaste** schiebt das ausgewählte Element um 1 Einheit, mit zusätzlich Umschalt um 10. Zahlenfelder für Position und Größe sowie Knöpfe zum Drehen und Spiegeln in der Kontextleiste ersetzen das freie Ziehen mit der Maus.
- **Foto zuschneiden:** Ausschnitt mit den Pfeiltasten verschieben und zoomen, Enter beendet.
- **Löschen, Rückgängig, Kopieren, Duplizieren, Alles auswählen** laufen über die üblichen Tastenkürzel und über die Leiste. Ist eine Aktion ohne sichtbare Rückmeldung geschehen, sagt eine Statusmeldung sie an („Gelöscht: …", „Rückgängig gemacht").
- **Alternativtext** für das fertige Bild lässt sich im Bereich Herunterladen und Teilen und im Teilen-Menü der Kopfleiste eintragen.
- **Mobil (unter 900 px)** hat dieselben Wege: Bereichsleiste, Auswahl-Leiste und Elementleiste sind benannte Werkzeugleisten.

**Bekannte Grenzen:**

- Die gezeichnete Fläche beschreibt sich nur mit einer Kurzfassung („Seite 1: Text: …, Balken: …, Hintergrund"), nicht mit ihrem Aussehen.
- Freies Ziehen, Drehen und Skalieren mit der Maus hat Ersatzwege (Alt+Pfeiltasten, Zahlenfelder, Dreh- und Spiegelknöpfe), aber keine gleichwertig flüssige Tastaturgeste.
- Bei Vorlagen mit festen Elementen (zum Beispiel dem Balken im Dreizeiler) ändert Enter in der Ebenen-Liste nichts; deren Text steht im Bereich der Vorlage.
- Alternativtext je Seite gibt es noch nicht.
- Ein Durchlauf mit Screenreadern (NVDA, VoiceOver, TalkBack) steht aus; geprüft sind Bedienbaum, Tastaturwege und axe-Regeln.

## Screenreader

Wir haben die Oberfläche gegen ihren berechneten Accessibility-Tree geprüft, aber **noch keinen vollständigen Durchlauf mit NVDA, JAWS oder VoiceOver gemacht**. Automatische Prüfwerkzeuge finden erfahrungsgemäß nur 30 bis 40 Prozent der Barrieren; alles, was von Formulierung, Reihenfolge und Verständlichkeit abhängt, sehen sie nicht. Wir sagen deshalb ausdrücklich nicht zu, dass der Grünerator mit Screenreader gut bedienbar ist.

## Eine Barriere melden

Wenn dir etwas begegnet, das dich blockiert — auch wenn es hier schon steht:

📧 **[info@moritz-waechter.de](mailto:info@moritz-waechter.de)**

Hilfreich ist: welche Seite, was du tun wolltest, und womit du arbeitest (Browser, Screenreader, Vergrößerung). Wir antworten innerhalb von **zwei Wochen**. Wenn eine Barriere nicht schnell zu beheben ist, sagen wir, wie wir sie umgehen können, solange sie besteht.

## Wie geprüft wurde

**Selbstbewertung**, kein externer Test. Konkret:

- **axe-core** über 14 Routen der Web-Oberfläche — die Einstiegsseiten der Hauptbereiche — sowie über die Plusmenü-Überlagerung in zwei Fensterbreiten, jede davon in hellem **und** dunklem Modus. Zuletzt am 13. August 2026.
- **ESLint-Regelsätze** (`jsx-a11y` für das Web, `react-native-a11y` für die Mobil-App) laufen bei jeder Änderung mit.
- **Komponententests** mit `axe` an den Stellen, an denen ARIA von Hand gesetzt wird, auch für den Canvas-Editor (Kontextleiste, Bereichs- und Auswahl-Leisten, Ebenen-Liste, Texteditor).
- **Browser-Test des Canvas-Editors** (Playwright, axe und ein Tastatur-Durchlauf: Sprunglink, Ebenen, Text bearbeiten, Löschen, Rückgängig) am 26. Oktober 2026, Desktop und mobile Breite, heller Modus.

Ein **BITV-Test durch eine unabhängige Prüfstelle** hat nicht stattgefunden.

## Rechtlicher Status dieser Seite

Diese Seite ist eine **freiwillige Selbstauskunft**, keine _Erklärung zur Barrierefreiheit_ im Rechtssinn. Ob der Grünerator unter das deutsche Barrierefreiheitsstärkungsgesetz (BFSG) oder das österreichische Barrierefreiheitsgesetz (BaFG) fällt, ist noch nicht abschließend geklärt. Sobald das feststeht, wird diese Seite entsprechend umgestellt — mit den Bestandteilen, die dann verbindlich dazugehören.

Wir sagen das ausdrücklich, weil eine falsche Konformitätsaussage schlechter wäre als keine.
