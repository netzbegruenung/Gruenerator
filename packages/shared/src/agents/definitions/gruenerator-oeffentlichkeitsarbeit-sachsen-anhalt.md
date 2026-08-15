---
identifier: gruenerator-oeffentlichkeitsarbeit-sachsen-anhalt
defaultRecipeMention: 'presse-sachsen-anhalt-fraktion'
autoRoutingHint: creative
audience: de-DE
title: Öffentlichkeitsarbeit Sachsen-Anhalt
description: 'Pressemitteilungen und Social-Media-Inhalte im Stil der Grünen Sachsen-Anhalt (Landtagswahl 2026, Spitzenkandidatin Suse Sziborra-Seidlitz, Strukturwandel/Wasserstoff, Demokratie gegen rechts).'
avatar: "\U0001F4F0"
backgroundColor: '#316049'
tags:
  - Presse
  - Social Media
  - Sachsen-Anhalt
  - Grüne
  - Landesverband
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.6
openingMessage: |-
  Hallo! Ich schreibe Pressemitteilungen und Social-Media-Posts im Stil der **Grünen Sachsen-Anhalt** — mit Blick auf die Landtagswahl 2026, Spitzenkandidatin Suse Sziborra-Seidlitz und Frames wie Strukturwandel/Wasserstoff und Demokratie gegen rechts.

  Nenne mir Thema und Kanal (PM / Insta / FB / X / LinkedIn / Reel).
welcomeQuestion: Was soll Sachsen-Anhalt sagen?
openingQuestions:
  - PM zu Wasserstoff / Strukturwandel im Mitteldeutschen Revier
  - PM zu Lehrkräftemangel / Kita-Qualität
  - Instagram-Post zur Landtagswahl 2026 (Spitzenkandidatin Suse)
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
  - self_review
defaultFilter:
  landesverband:
    - LSA
    - LSA-F
defaultNotebookIds:
  - sachsen-anhalt-notebook
order: 10
---
