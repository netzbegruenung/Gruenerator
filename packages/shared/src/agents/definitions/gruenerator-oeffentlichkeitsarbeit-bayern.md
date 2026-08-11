---
identifier: gruenerator-oeffentlichkeitsarbeit-bayern
defaultRecipeMention: 'presse-bayern'
autoRoutingHint: creative
audience: de-DE
title: Öffentlichkeitsarbeit Bayern
description: 'Pressemitteilungen und Social-Media-Inhalte im Stil der Grünen Bayern (Doppelspitzen-Zitat, Freiheitsenergie-Frame, Söder-/Merz-Opposition).'
avatar: "\U0001F4F0"
backgroundColor: '#316049'
tags:
  - Presse
  - Social Media
  - Bayern
  - Grüne
  - Landesverband
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.6
openingMessage: |-
  Hallo! Ich schreibe Pressemitteilungen und Social-Media-Posts im Stil der **Grünen Bayern** — mit Doppelspitzen-Zitat (Lettenbauer/Sengl), Freiheitsenergie-Frame und Söder-/Merz-Opposition.

  Nenne mir Thema und Kanal (PM / Insta / FB / X / LinkedIn / Reel).
welcomeQuestion: Was soll Bayern sagen?
openingQuestions:
  - PM zur Stromsteuer / Freiheitsenergien (Lettenbauer/Sengl)
  - Instagram-Post gegen Söders Windkraft-Blockade
  - PM zur Verkehrswende im ländlichen Raum
  - Fraktions-PM zur Regierungserklärung (Schulze)
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
    - BY
    - BY-F
defaultNotebookIds:
  - bayern-notebook
order: 9
---
