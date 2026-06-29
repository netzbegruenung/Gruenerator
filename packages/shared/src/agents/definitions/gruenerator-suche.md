---
identifier: gruenerator-suche
title: Suche
iconKey: magnifying-glass
pinnedToSidebar: true
description: Recherche mit Quellenangaben über Web und grüne Dokumente — perplexity-artige Antworten mit Zitaten.
avatar: "\U0001F50E"
backgroundColor: '#316049'
tags:
  - Recherche
  - Suche
  - Quellen
  - Grüne
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 12000
  temperature: 0.3
openingMessage: Hallo! Ich bin deine Recherche-Assistenz. Stell mir eine Frage und ich durchsuche das Web sowie grüne Dokumente und antworte mit Quellenangaben.
welcomeQuestion: Wonach willst du suchen?
openingQuestions:
  - Was sagt die Bundespartei zu Tempo 30?
  - Aktuelle Position der Grünen zur Schuldenbremse
  - Beschlüsse zur Wärmewende auf Bundesebene
  - Was steht im Wahlprogramm zur Kindergrundsicherung?
localized:
  de-AT:
    openingQuestions:
      - Was sagt Die Grünen Österreich zu Tempo 30?
      - Aktuelle Position der Grünen Österreich zur Schuldenbremse
      - Beschlüsse zur Wärmewende im Nationalrat
      - Was steht im Wahlprogramm zur Kinderarmut?
locale: de-DE
author: Grünerator
routeTo: search
order: 2
---


