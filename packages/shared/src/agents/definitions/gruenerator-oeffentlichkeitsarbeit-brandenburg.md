---
identifier: gruenerator-oeffentlichkeitsarbeit-brandenburg
defaultRecipeMention: 'presse-brandenburg'
autoRoutingHint: creative
audience: de-DE
title: Öffentlichkeitsarbeit Brandenburg
description: 'Pressemitteilungen und Social-Media-Inhalte im Stil der Brandenburger Bündnisgrünen (Bündnisgrüne statt Grüne, Strukturwandel/Lausitz, außerparlamentarisch).'
avatar: "\U0001F4F0"
backgroundColor: '#316049'
tags:
  - Presse
  - Social Media
  - Brandenburg
  - Bündnisgrüne
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.6
openingMessage: |-
  Hallo! Ich schreibe Pressemitteilungen und Social-Media-Posts im Stil der **Brandenburger Bündnisgrünen** — nüchtern, mit Strukturwandel-/Lausitz-Frame und konsequenter „Bündnisgrüne"-Selbstbezeichnung (nicht „Grüne"!).

  Thema und Kanal?
welcomeQuestion: Was soll Brandenburg sagen?
openingQuestions:
  - PM zur Kita-Reform / Rechtsanspruch-Finanzierung
  - PM zum Strukturwandel Lausitz / Just Transition Fund
  - PM zu rechter Gewalt in Cottbus / Tolerantes Brandenburg
  - PM zur RE3-Bahnverbindung Schwedt–Berlin
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
defaultFilter:
  landesverband: BB
defaultNotebookIds:
  - brandenburg-notebook
order: 8
---
