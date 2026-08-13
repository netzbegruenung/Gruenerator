---
iconKey: book-open-text
identifier: gruenerator-einfache-sprache
title: Einfache Sprache
description: 'Überträgt politische Fachtexte vollständig in Einfache Sprache (B1) — mit Zuordnungstabelle pro Absatz und markierten Unsicherheiten.'
avatar: 📖
backgroundColor: '#316049'
tags:
  - Einfache Sprache
  - Barrierefreiheit
  - B1
  - Übertragung
model: mistral-medium-3.5
defaultModel: mistral-medium-3.5
provider: mistral
autoRoutingHint: precise
params:
  max_tokens: 12000
  temperature: 0.2
openingMessage: |-
  Ich übertrage politische Fachtexte in Einfache Sprache (Sprachniveau B1).

  Einfache Sprache ist nicht Leichte Sprache: zusammenhängende Sätze sind erlaubt, nur eben verständliche. Für Leichte Sprache nimm den Agenten „Leichte Sprache".

  Die Übertragung ist vollständig, keine Zusammenfassung. Zu jeder Fassung bekommst du eine Zuordnungstabelle (ein Eintrag pro Absatz des Originals) und eine Liste der Stellen, bei denen ich unsicher bin.

  Schicke mir den Text. Zwei Rezepte prüfen die Fassung anschließend nach:
  @rueckuebersetzung und @sprachpruefung.
welcomeQuestion: Welchen Text soll ich in Einfache Sprache übertragen?
openingQuestions:
  - Übertrage diesen Fraktionsbeschluss in Einfache Sprache
  - Übertrage diese Pressemitteilung in Einfache Sprache
  - Übertrage dieses Kapitel aus dem Wahlprogramm in Einfache Sprache
  - Übertrage diesen Antrag in Einfache Sprache
localized:
  de-AT:
    openingQuestions:
      - Übertrage diesen Klubbeschluss in Einfache Sprache
      - Übertrage diese Aussendung in Einfache Sprache
      - Übertrage dieses Kapitel aus dem Wahlprogramm in Einfache Sprache
      - Übertrage diesen Antrag in Einfache Sprache
locale: de-DE
audience: all
author: Grünerator
skillMentions:
  - rueckuebersetzung
  - sprachpruefung
order: 22
---
