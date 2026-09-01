---
sidebar_position: 4
title: Grünerator für Chrome
description: 'Die Browser-Erweiterung erledigt Aufgaben im geöffneten Tab: suchen, blättern, klicken, Formulare ausfüllen, Inhalte heraussuchen.'
---

# Grünerator für Chrome — Erste Schritte

Der **Grünerator für Chrome** ist eine Browser-Erweiterung, die Aufgaben auf Webseiten für dich erledigt: suchen, blättern, anklicken, Formulare ausfüllen, Inhalte heraussuchen. Du beschreibst in einem Seitenpanel, was passieren soll — die Erweiterung arbeitet **im gerade geöffneten Tab**, so als würdest du selbst klicken.

:::warning[Testphase]
Die Erweiterung ist noch nicht im Chrome Web Store und spricht derzeit mit `beta.gruenerator.eu`. Oberfläche und Verhalten können sich noch ändern.
:::

## Was du brauchst

- **Chrome oder Edge.** Firefox und Safari werden nicht unterstützt.
- **Ein Grünerator-Konto** — dasselbe wie auf gruenerator.eu.

Einen eigenen API-Schlüssel brauchst du **nicht**. Die Erweiterung spricht ausschließlich mit dem Grünerator; ein Feld für einen anderen Anbieter gibt es nicht.

## 1. Installieren

Solange die Erweiterung nicht im Web Store steht, installierst du sie aus einem Ordner:

1. ZIP-Datei herunterladen und **entpacken**. Der entpackte Ordner muss liegen bleiben — Chrome lädt die Erweiterung bei jedem Start von dort.
2. In Chrome `chrome://extensions` öffnen.
3. Oben rechts den **Entwicklermodus** einschalten.
4. Auf **Entpackte Erweiterung laden** klicken und den entpackten Ordner auswählen.
5. Im Puzzle-Symbol der Symbolleiste den Grünerator **anpinnen** — dann ist er einen Klick entfernt.

Ein Klick auf das Grünerator-Symbol öffnet das **Seitenpanel** am rechten Bildschirmrand. Dort spielt sich alles Weitere ab.

:::info[Warum Entwicklermodus?]
Chrome verlangt ihn für jede Erweiterung, die nicht aus dem Web Store kommt. Die Erweiterung bringt einen festen Schlüssel mit, deshalb bleibt ihre Kennung über Neuinstallationen hinweg gleich — die Anmeldung funktioniert auch in dieser Fassung.
:::

## 2. Anmelden

Beim ersten Öffnen zeigt das Seitenpanel _„Willkommen beim Grünerator für Chrome!"_.

1. Auf **Mit Grünerator anmelden** klicken.
2. Chrome öffnet ein Anmeldefenster. Melde dich wie gewohnt an und bestätige den Zugriff.
3. Das Fenster schließt sich von selbst, das Seitenpanel wechselt zur Eingabe.

Es gibt nichts zu kopieren und einzufügen: Die Anmeldung läuft über denselben Weg wie „Mit Google anmelden", und auf dem Gerät bleibt nur ein Zugriffstoken liegen — kein Passwort.

Schließt du das Fenster vorzeitig, meldet die Erweiterung _„Anmeldung abgebrochen"_. Dann einfach noch einmal klicken.

## 3. Die erste Aufgabe

Unter dem Eingabefeld stehen drei fertige **Vorlagen**:

| Vorlage                                      | Wozu                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------- |
| 📋 Anträge einer Sitzung sammeln             | Titel, Antragsteller und Links von einer Sitzungsseite zusammentragen |
| 🗳️ Wahlprogramm nach einem Thema durchsuchen | Passende Abschnitte samt Textstelle heraussuchen                      |
| 📰 Pressespiegel bauen                       | Aktuelle Meldungen zu einem Thema mit Quelle, Datum und Link sammeln  |

Ein Klick lädt die Vorlage ins Eingabefeld — dort passt du sie an und schickst sie ab. Eigene Vorlagen legst du an, indem du im **Verlauf** eine Sitzung über **Sitzung merken** ablegst.

### Aufgaben, die gut funktionieren

Die Erweiterung arbeitet Schritt für Schritt. Aufgaben gelingen deshalb besser, wenn du drei Dinge nennst:

> **Wo es losgeht** — _„Öffne gruene.de"_ oder einfach die Seite vorher aufschlagen.
>
> **Was zu tun ist** — _„Suche die Abschnitte zum Thema Verkehr"_.
>
> **Wie das Ergebnis aussehen soll** — _„Gib mir je Fundstelle Titel, Link und zwei Sätze Zusammenfassung"_.

:::tip[Erst die richtige Seite öffnen]
Die Aufgabe startet immer im **aktiven Tab**. Steht dort noch die leere Startseite, muss der Agent erst dorthin navigieren — das kostet Schritte. Öffne die Seite vorher, wenn du sie kennst.
:::

## Wie die Erweiterung arbeitet

Hinter dem Seitenpanel stecken zwei Agenten — im Gesprächsverlauf erkennst du sie an ihren Namen:

- **Navigator** — führt aus. Er klickt, tippt, blättert, wechselt Tabs und liest die Seite. Er läuft in **jedem** Schritt.
- **Planner** — legt das Vorgehen fest und prüft den Fortschritt. Er läuft standardmäßig **alle drei Schritte** und immer dann, wenn der Navigator meldet, er sei fertig.

Was der Navigator auf einer Seite tun kann: bei Google suchen, Adressen öffnen, zurückgehen, Elemente anklicken, Text eingeben, Tabs öffnen, wechseln und schließen, scrollen (auch gezielt zu einer Textstelle), Tastenkürzel senden, Auswahllisten lesen und auswählen, Gefundenes zwischenspeichern und warten.

:::warning[Der Agent arbeitet in deiner Sitzung]
Er benutzt deinen Browser mit deinen Anmeldungen. Wo du eingeloggt bist, ist er es auch — und er handelt mit deinen Rechten. Lass ihn nicht unbeaufsichtigt auf Seiten laufen, auf denen etwas Verbindliches passieren kann (Bezahlvorgänge, Verwaltungsoberflächen, Mitgliederdaten).
:::

## Anhalten, weiterfragen, wiederholen

- **Anhalten** stoppt eine laufende Aufgabe sofort.
- Ist eine Aufgabe fertig, kannst du **einfach weiterschreiben** — die Nachfrage läuft in derselben Sitzung weiter und kennt den bisherigen Verlauf.
- Über die Symbole oben im Panel startest du einen **neuen Chat** oder öffnest den **Verlauf**.
- Im Verlauf lässt sich jede Sitzung löschen oder als Vorlage merken.

## Dateien mitgeben

Über die Büroklammer hängst du Textdateien an: `.txt`, `.md`, `.markdown`, `.json`, `.csv`, `.log`, `.xml`, `.yaml`, `.yml`. Pro Datei sind **1 MB** möglich, mehrere Dateien gleichzeitig sind erlaubt. Andere Formate — etwa PDF oder DOCX — nimmt die Erweiterung nicht an; für die ist der [Chat auf gruenerator.eu](../chat/dateien-hinzufuegen) der richtige Ort.

## Modell wählen

Unter **Einstellungen → Modelle** wählst du für Navigator und Planner getrennt eine Stufe:

| Stufe      | Wofür                                             |
| ---------- | ------------------------------------------------- |
| **Klein**  | am schnellsten, für kurze und eindeutige Aufgaben |
| **Mittel** | die Voreinstellung — der gute Mittelweg           |
| **Ultra**  | für lange Aufgaben mit vielen Schritten           |

Welches Modell hinter einer Stufe läuft, entscheidet der Grünerator. Deine Auswahl bleibt gültig, auch wenn sich das ändert — du musst nichts nachziehen. Mehr dazu: [KI-Modelle im Grünerator](../chat/ki-modelle).

## Einstellungen im Detail

Der Reiter **Allgemein** steuert, wie ausdauernd und wie gründlich der Agent arbeitet:

| Einstellung                  | Voreinstellung | Bedeutung                                                                           |
| ---------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| Schritte je Aufgabe          | 100            | Obergrenze, danach bricht die Aufgabe ab                                            |
| Aktionen je Schritt          | 5              | wie viel der Navigator in einem Zug erledigen darf                                  |
| Fehlertoleranz               | 3              | Fehler hintereinander, bevor abgebrochen wird                                       |
| Bilderkennung                | aus            | das Modell sieht die Seite zusätzlich als Bild — bessere Ergebnisse, mehr Verbrauch |
| Elemente hervorheben         | an             | markiert Knöpfe, Links und Felder sichtbar auf der Seite                            |
| Neuplanung                   | 3              | nach wie vielen Schritten der Planner das Vorgehen überdenkt                        |
| Wartezeit nach dem Laden     | 250 ms         | Mindestpause, bevor eine frisch geladene Seite ausgewertet wird                     |
| Frühere Aufgaben wiederholen | aus            | speichert die Schritte und spielt sie erneut ab (Versuchsbetrieb)                   |

:::note
Schaltest du die **Bilderkennung** ein, wird **Elemente hervorheben** automatisch mit eingeschaltet — die Markierungen sind es, an denen sich das Modell im Bildschirmfoto orientiert.
:::

## Firewall

Im Reiter **Firewall** legst du fest, welche Adressen der Agent überhaupt anfassen darf. Trage Domains ohne `https://` ein, also `example.com`, `localhost` oder `127.0.0.1`.

- Sind **beide Listen leer**, ist jede Adresse erlaubt.
- Die **Sperrliste hat Vorrang**: Passt eine Adresse auf einen Eintrag, ist sie blockiert.
- Ist die **Erlaubnisliste leer**, ist alles erlaubt, was nicht gesperrt ist.
- Steht dort etwas, sind **nur noch** passende Adressen erlaubt.
- Platzhalter (`*`) werden noch nicht unterstützt.

Die Erlaubnisliste ist das schärfere Werkzeug: Ein einziger Eintrag sperrt das gesamte übrige Netz aus.

## Was die Erweiterung sieht — und was nicht

Damit ein Modell entscheiden kann, was als Nächstes zu tun ist, geht der aktuelle **Seitenzustand an den Grünerator**: die Struktur der bedienbaren Elemente, sichtbarer Text und — nur bei eingeschalteter Bilderkennung — ein Bildschirmfoto. Das ist keine Nebenwirkung, sondern die Funktion: ohne Seiteninhalt gibt es nichts zu entscheiden.

Auf dem Gerät bleiben dagegen: **Chatverlauf, Vorlagen, Einstellungen und dein Zugriffstoken**. Sie liegen im lokalen Speicher des Browsers und werden nicht synchronisiert.

Die Erweiterung enthält **keine Telemetrie** — keine besuchten Domains, keine Aufgabendauern, keine anonyme Kennung. Und sie liest keine Zugangsdaten oder Cookies der besuchten Seiten aus.

## Wenn etwas klemmt

**Nach der Anmeldung steht immer noch der Willkommensbildschirm.**
Öffne **Einstellungen → Modelle**. Steht dort „Angemeldet", ist alles in Ordnung — schließe das Seitenpanel und öffne es erneut. Steht dort ein Anmeldeknopf, hat die Anmeldung nicht durchgetragen; versuche es dort noch einmal.

**Auf der Seite passiert gar nichts.**
Auf `chrome://`-Seiten, im Web Store und in der Einstellungsoberfläche von Chrome darf keine Erweiterung arbeiten — das sperrt der Browser selbst. Prüfe außerdem die **Firewall**.

**Die Aufgabe bricht mit „maximale Schrittzahl erreicht" ab.**
Entweder die Aufgabe ist zu groß — dann teile sie —, oder der Agent dreht sich im Kreis. Ein höherer Wert bei **Schritte je Aufgabe** hilft nur, wenn er sonst wirklich vorankommt.

**Der Agent klickt das Falsche.**
Schalte die **Bilderkennung** ein. Bei dicht gebauten Seiten hilft es, wenn das Modell die Anordnung sieht statt nur die Struktur.

**Der Agent bricht mehrfach hintereinander ab.**
Die **Fehlertoleranz** steht auf 3. Bei langsamen Seiten lohnt sich zusätzlich eine höhere **Wartezeit nach dem Laden**.

## Grenzen

Der Agent ist ein Sprachmodell mit Fernbedienung, kein zuverlässiger Automat. Er verliest sich, klickt daneben und behauptet gelegentlich, etwas erledigt zu haben, das er nicht erledigt hat. **Prüfe jedes Ergebnis, bevor du damit weiterarbeitest** — besonders bei Zahlen, Zitaten und Links.

Warum das so ist und woran man es erkennt, steht unter [Risiken und Gefahren von LLMs](../basics/risiken-und-gefahren-von-llms).

## Und jetzt?

- Der Grünerator lässt sich auch andersherum einbinden: [in ChatGPT, Claude und Le Chat](./ki-chat-einrichten).
- Externe Dienste in den Chat holen: [Konnektoren](./konnektoren).
- Für alles, was kein Browser sein muss, ist der [Chat auf gruenerator.eu](../chat/ki-chat) der schnellere Weg.
