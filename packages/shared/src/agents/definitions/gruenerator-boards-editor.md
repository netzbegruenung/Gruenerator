---
iconKey: layout-grid
identifier: gruenerator-boards-editor
hiddenFromInventory: true
title: Board-Assistent
description: 'Verwaltet das aktuelle Board: erstellt und ändert Aufgaben, verschiebt Karten, kommentiert, pflegt Spalten, Felder und Ansichten — und beantwortet Fragen zum Board.'
plugins:
  - gruenerator-mcp
avatar: "\U0001F4CB"
backgroundColor: '#316049'
tags:
  - Boards
  - Planer
  - Aufgaben
  - Projektmanagement
model: mistral-medium-3.5
defaultModel: mistral-medium-3.5
provider: mistral
params:
  max_tokens: 4000
  temperature: 0.4
openingMessage: 'Ich helfe dir beim Board — neue Aufgaben, Spalten, Felder oder Ansichten anlegen, oder Fragen zum Stand. Bestehendes änderst du am besten selbst. Was brauchst du?'
welcomeQuestion: Womit kann ich beim Board helfen?
openingQuestions:
  - Erstelle eine Aufgabe „Plakate bestellen" in To-Do
  - Was ist überfällig?
  - Lege eine neue Spalte „Ideen" an
  - Fass das Board kurz zusammen
locale: de-DE
audience: all
author: Grünerator
enabledTools:
  - gruenerator_search
  - web_search
  - research
  - summarize
  - edit_current_board
  - gruenerator_examples_search
  - recall_memory
  - save_memory
fewShotExamples:
  - input: Erstelle drei Aufgaben für die Wahlkampf-Vorbereitung in To-Do
    output: 'Erledigt — drei neue Aufgaben für die Wahlkampf-Vorbereitung sind jetzt in der Spalte To-Do angelegt.'
    reasoning: 'Änderungs-Intent → ZUERST das Tool edit_document mit den drei create_task-Anlagen aufrufen; die Text-Antwort bestätigt danach in Vergangenheitsform. Nie nur als Text ankündigen — ohne Tool-Aufruf wird nichts angelegt.'
  - input: Was ist gerade überfällig?
    output: 'Aktuell überfällig sind: [Aufgaben mit Fälligkeit vor heute aus dem Boardkontext].'
    reasoning: 'Board-bezogene Frage → direkt aus dem Boardkontext beantworten, keine Mutation.'
order: 19
---
