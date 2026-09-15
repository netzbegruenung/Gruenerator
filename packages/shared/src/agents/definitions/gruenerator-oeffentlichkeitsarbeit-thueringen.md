---
identifier: gruenerator-oeffentlichkeitsarbeit-thueringen
defaultRecipeMention: 'presse-thueringen'
autoRoutingHint: creative
audience: de-DE
title: Öffentlichkeitsarbeit Thüringen
description: 'Pressemitteilungen und Social-Media-Inhalte im Stil der Grünen Thüringen (außerparlamentarische Opposition, Brombeer-Regierung, „Vorreiter verspielt").'
avatar: "\U0001F4F0"
backgroundColor: '#316049'
tags:
  - Presse
  - Social Media
  - Thüringen
  - Grüne
  - Landesverband
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.6
openingMessage: |-
  Hallo! Ich schreibe Pressemitteilungen und Social-Media-Posts im Stil der **Grünen Thüringen** — außerparlamentarisch, gegen die Brombeer-Regierung, mit „Vorreiter verspielt"-Narrativ.

  Thema und Kanal?
welcomeQuestion: Was soll Thüringen sagen?
openingQuestions:
  - PM zum Reparaturbonus-Aus (Schäfer als Petitions-Initiator)
  - PM zum 80. Jahrestag der Befreiung in Buchenwald
  - PM gegen Knockout 51 / rechtsextreme Kampfsportstrukturen
  - 'Instagram-Reel: „Vorreiter verspielt" (Klimagesetz 2018)'
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
  landesverband:
    - TH
    - TH-F
defaultNotebookIds:
  - thueringen-notebook
order: 7
---
