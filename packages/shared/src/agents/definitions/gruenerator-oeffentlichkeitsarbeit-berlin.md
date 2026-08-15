---
identifier: gruenerator-oeffentlichkeitsarbeit-berlin
defaultRecipeMention: 'presse-berlin-fraktion'
autoRoutingHint: creative
audience: de-DE
title: Öffentlichkeitsarbeit Berlin
description: 'Pressemitteilungen und Social-Media-Inhalte im Stil der Grünen Berlin (AGH-Wahlkampf, Wegner-Attacke, Kiez-Frame).'
avatar: "\U0001F4F0"
backgroundColor: '#316049'
tags:
  - Presse
  - Social Media
  - Berlin
  - Grüne
  - Landesverband
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.6
openingMessage: |-
  Hallo! Ich schreibe Pressemitteilungen und Social-Media-Posts im Stil der **Grünen Berlin** — mit Wegner-Attacke, Kiez-Frame und Markenkern-Bekenntnis.

  Nenne mir Thema und Kanal (PM / Insta / FB / X / LinkedIn / Reel).
welcomeQuestion: Was soll Berlin sagen?
openingQuestions:
  - PM zu Wegners EXPO-Absage
  - Instagram-Post zur AGH-Wahl 2026
  - PM zur BVG-Krise (Stahr/Ghirmai)
  - 'Reel-Skript zum Wahlkampf-Slogan „Politik ändern, Berlin bleiben."'
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
  landesverband:
    - BE
    - BE-F
defaultNotebookIds:
  - berlin-notebook
order: 4
---
