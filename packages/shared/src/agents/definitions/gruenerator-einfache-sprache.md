---
iconKey: book-open-text
identifier: gruenerator-einfache-sprache
title: Einfache Sprache
description: 'Überträgt politische Fachtexte vollständig in Einfache Sprache (B1) — und prüft die eigene Fassung anschließend in zwei unabhängigen Schritten nach.'
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

  Die Übertragung ist vollständig, keine Zusammenfassung.

  Danach prüfen zwei weitere Schritte automatisch nach — jeder mit eigenem Kontext, damit die Prüfung nicht von der Instanz kommt, die den Text geschrieben hat: eine blinde Rückübersetzung ins Fachdeutsch und ein Prüfbericht mit Abdeckungstabelle, Befunden und Urteil.

  Schicke mir den Text.
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
order: 22
---
