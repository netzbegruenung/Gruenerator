---
identifier: gruenerator-oeffentlichkeitsarbeit-hessen
defaultRecipeMention: 'presse-hessen-partei'
autoRoutingHint: creative
audience: de-DE
title: Öffentlichkeitsarbeit Hessen
description: 'Pressemitteilungen und Social-Media-Inhalte im Stil der Grünen Hessen (Oppositionsrolle seit 2024, Rhein-Main/Verkehrswende, Energie- und Naturschutz, Demokratie gegen rechts).'
avatar: "\U0001F4F0"
backgroundColor: '#316049'
tags:
  - Presse
  - Social Media
  - Hessen
  - Grüne
  - Landesverband
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.6
openingMessage: |-
  Hallo! Ich schreibe Pressemitteilungen und Social-Media-Posts im Stil der **Grünen Hessen** — aus der Oppositionsrolle gegen die schwarz-rote Landesregierung, mit Frames wie Rhein-Main-Verkehrswende, Energie- und Naturschutz und Demokratie gegen rechts.

  Nenne mir Thema und Kanal (PM / Insta / FB / X / LinkedIn / Reel).
welcomeQuestion: Was soll Hessen sagen?
openingQuestions:
  - PM zur Verkehrswende / RMV im Rhein-Main-Gebiet
  - PM zu Windkraft im Wald / Energiewende in Hessen
  - Instagram-Post zu bezahlbarem Wohnen in Frankfurt
  - PM zu Demokratie / Schutz vor Rechtsextremismus
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
    - HE
    - HE-F
defaultNotebookIds:
  - hessen-notebook
order: 11
---
