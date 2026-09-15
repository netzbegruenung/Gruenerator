---
iconKey: file-text
identifier: gruenerator-docs-editor
hiddenFromInventory: true
title: Dokument-Assistent
description: 'Beantwortet Fragen zum aktuellen Dokument, schlägt Überarbeitungen vor und recherchiert ergänzende Hintergründe.'
plugins:
  - gruenerator-mcp
avatar: "\U0001F4DD"
backgroundColor: '#316049'
tags:
  - Dokumente
  - Editor
  - Schreiben
  - Recherche
model: mistral-medium-3.5
defaultModel: mistral-medium-3.5
provider: mistral
params:
  max_tokens: 4000
  temperature: 0.5
openingMessage: 'Ich helfe dir beim aktuellen Dokument — Fragen, Umschreiben, Kürzen, Recherche. Was brauchst du?'
welcomeQuestion: Womit kann ich beim Dokument helfen?
openingQuestions:
  - Fass das Dokument kurz zusammen
  - Was haben wir hier konkret beschlossen?
  - Kürze den ersten Absatz
  - Was sagt die Bundespartei zu diesem Thema?
localized:
  de-AT:
    openingQuestions:
      - Fass das Dokument kurz zusammen
      - Was haben wir hier konkret beschlossen?
      - Kürze den ersten Absatz
      - Was sagt Die Grünen Österreich zu diesem Thema?
locale: de-DE
author: Grünerator
enabledTools:
  - gruenerator_search
  - web_search
  - gruenerator_examples_search
  - research
  - summarize
  - edit_current_doc
  - save_as_doc
  - generate_image
  - edit_image
  - analyze_image
  - scrape_url
  - find_content
  - recall_memory
  - save_memory
fewShotExamples:
  - input: Was haben wir dazu beschlossen?
    output: 'Im aktuellen Dokument ist festgehalten, dass [Zitat/Paraphrase aus dem Dokument]. Falls du weitere Details suchst, kann ich gerne nach ergänzenden Quellen recherchieren.'
    reasoning: 'Dokument-bezogene Frage → primär aus dem AKTUELLEN DOKUMENT antworten, kein search-Aufruf.'
  - input: Kürze den letzten Absatz
    output: 'Ich schlage folgende kürzere Fassung vor: [neue Version]. Soll ich sie direkt einsetzen?'
    reasoning: 'Modifikations-Intent → modify_doc-Pfad, konkreten Vorschlag liefern.'
  - input: Was sagt die Bundespartei zu Tempo 30?
    output: '[Antwort mit gruenerator_search-Ergebnissen und Zitaten aus den Bundesparteibeschlüssen [1], [2].]'
    reasoning: Externe Info → gruenerator_search zusätzlich zum Dokumentkontext.
order: 18
---
