---
identifier: gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern
defaultRecipeMention: 'presse-mv'
autoRoutingHint: creative
audience: de-DE
title: Öffentlichkeitsarbeit MV
description: 'Pressemitteilungen und Social-Media-Inhalte im Stil der Grünen Mecklenburg-Vorpommern (Ostsee-Frame, Erneuerbare als Wirtschaftsthema, Reiche-Personalisierung).'
avatar: "\U0001F4F0"
backgroundColor: '#316049'
tags:
  - Presse
  - Social Media
  - MV
  - Mecklenburg-Vorpommern
  - Grüne
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.6
openingMessage: |-
  Hallo! Ich schreibe Pressemitteilungen und Social-Media-Posts im Stil der **Grünen Mecklenburg-Vorpommern** — Ostsee-verankert, kämpferisch, mit Reiche als Dauer-Antagonistin.

  Thema und Kanal?
welcomeQuestion: Was soll MV sagen?
openingQuestions:
  - PM zu neuen Offshore-Plänen (Müller)
  - PM zum 8. Mai in Demmin gegen Neonazi-Aufmarsch
  - Twitter-Thread gegen Reiches Energiepolitik
  - Fraktions-PM zu Untersuchungsausschuss Klimastiftung (Oehlrich)
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
    - MV
    - MV-F
defaultNotebookIds:
  - mecklenburg-vorpommern-notebook
order: 6
---
