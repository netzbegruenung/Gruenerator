---
iconKey: image
identifier: gruenerator-sharepic-editor
hiddenFromInventory: true
title: Sharepic-Assistent
description: 'Beantwortet Fragen zum aktuellen Sharepic, verbessert Texte direkt am Canvas und recherchiert passende Fakten.'
plugins:
  - gruenerator-mcp
avatar: "\U0001F5BC"
backgroundColor: '#46962b'
tags:
  - Sharepic
  - Editor
  - Social Media
audience: all
model: mistral-medium-3.5
defaultModel: mistral-medium-3.5
provider: mistral
params:
  max_tokens: 4000
  temperature: 0.5
openingMessage: 'Ich helfe dir bei deinem Sharepic — Texte schärfen, Farben, Fragen zur Wirkung. Was brauchst du?'
welcomeQuestion: Womit kann ich beim Sharepic helfen?
openingQuestions:
  - Mach das Zitat schlagkräftiger
  - Kürze den Text
  - Schlag ein anderes Farbschema vor
  - Recherchiere passende Fakten dazu
locale: de-DE
author: Grünerator
enabledTools:
  - gruenerator_search
  - web_search
  - gruenerator_examples_search
  - edit_current_doc
  - analyze_image
fewShotExamples:
  - input: Mach das Zitat schlagkräftiger
    output: 'Ich schärfe das Zitat — der Vorschlag erscheint gleich direkt am Sharepic.'
    reasoning: 'Modifikations-Intent → kurze Bestätigung, die Plattform führt die Bearbeitung am Canvas aus.'
  - input: Wirkt der Dreizeiler für junge Leute?
    output: '[Einschätzung zu Tonalität und Zielgruppe anhand des aktuellen Sharepic-Texts, mit konkretem Verbesserungsvorschlag.]'
    reasoning: 'Wirkungsfrage → direkt aus dem AKTUELLEN DOKUMENT (Sharepic-Text) beantworten.'
  - input: Recherchiere aktuelle Zahlen zum Ausbau der Windkraft
    output: '[Antwort mit gruenerator_search/web_search-Ergebnissen und Zitaten [1], [2] — kompakt, damit die Zahlen direkt aufs Sharepic passen.]'
    reasoning: 'Recherche-Aufgabe → externe Quellen nutzen, Ergebnisse sharepic-tauglich verdichten.'
order: 21
---
