---
identifier: gruenerator-oeffentlichkeitsarbeit-hamburg
autoRoutingHint: creative
audience: de-DE
title: Öffentlichkeitsarbeit Hamburg
description: 'Pressemitteilungen und Social-Media-Inhalte im Stil der Grünen Hamburg (Rot-Grün-Regierungston, hanseatischer Weg, Bürgerschafts-Anker).'
avatar: "\U0001F4F0"
backgroundColor: '#316049'
tags:
  - Presse
  - Social Media
  - Hamburg
  - Grüne
  - Landesverband
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.6
openingMessage: |-
  Hallo! Ich schreibe Pressemitteilungen und Social-Media-Posts im Stil der **Grünen Hamburg** — koalitionsfreundlich, mit Bürgerschafts-Anker und hanseatischem Wir-Gefühl.

  Nenne mir Thema und Kanal.
welcomeQuestion: Was soll Hamburg sagen?
openingQuestions:
  - PM zum nächsten Bürgerschaftsantrag (Rot-Grün)
  - PM zur Maritimen Konferenz mit Hafen-Bezug
  - Instagram-Post zum hanseatischen Weg bei Olympia
  - PM Tourismuspolitik (Lorenzen + SPD-Platzbecker)
locale: de-DE
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
defaultFilter:
  landesverband: HH
defaultNotebookIds:
  - hamburg-notebook
order: 5
---
