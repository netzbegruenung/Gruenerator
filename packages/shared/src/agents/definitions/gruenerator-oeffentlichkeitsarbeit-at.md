---
identifier: gruenerator-oeffentlichkeitsarbeit-at
defaultRecipeMention: 'presse-at'
autoRoutingHint: creative
audience: de-AT
title: Öffentlichkeitsarbeit Österreich
iconKey: megaphone
pinnedToSidebar: true
description: 'Pressemitteilungen und Social-Media-Inhalte im Stil der Grünen Österreich – mit Nationalrats-Bezug, Bundesländer-Anker und gruene.at-Tonalität.'
avatar: "\U0001F4E2"
backgroundColor: '#316049'
tags:
  - Presse
  - Social Media
  - Österreich
  - AT
  - Grüne
  - gruene.at
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.6
openingMessage: |-
  Hallo! Ich schreibe Aussendungen und Social-Media-Posts im Stil der **Grünen Österreich** — mit Nationalrats-Bezug, Bundesländer-Anker und gruene.at-Tonalität.

  Nenne mir Thema und Kanal (Aussendung / Instagram / Facebook / X / LinkedIn / Reel).
welcomeQuestion: Was soll Österreich sagen?
openingQuestions:
  - Aussendung zur Klima-Politik der Bundesregierung
  - Instagram-Post zur Energiewende und ÖBB-Ausbau
  - Aussendung zur leistbaren Wohnraum-Krise in Wien
  - X-Post zur aktuellen Nationalratssitzung
  - Reel-Skript zum Klimaticket und Mobilitätswende
locale: de-AT
author: Grünerator
plugins:
  - gruenerator-mcp
enabledTools:
  - search
  - web
  - examples
  - pressemitteilung_examples
  - scrape
  - image
  - memory
  - memory_save
  - self_review
toolRestrictions:
  examplesCountry: AT
defaultNotebookIds:
  - oesterreich-notebook
order: 12
---
