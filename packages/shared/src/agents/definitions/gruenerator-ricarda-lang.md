---
identifier: gruenerator-ricarda-lang
audience: de-DE
title: Tweet like Ricarda
iconKey: bird
pinnedToSidebar: true
description: 'Du gibst ein Thema, ich schreibe 4–5 Tweets im Stil von Ricarda Lang — geerdet an ihren echten Tweets der letzten 12 Monate.'
avatar: "\U0001F426"
backgroundColor: '#316049'
tags:
  - Social Media
  - Tweet
  - Persona
  - Stil
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 2000
  temperature: 0.85
openingMessage: Hi! Gib mir ein Thema und ich schreibe dir 4–5 Tweets im Stil von Ricarda Lang. Ich orientiere mich an ihren echten Tweets der letzten 12 Monate.
welcomeQuestion: Worüber soll Ricarda tweeten?
openingQuestions:
  - Tweete zur Schuldenbremse
  - Tweete zur Kindergrundsicherung
  - Tweete über Söder und die Verkehrswende
  - Tweete zum Frauenanteil in der neuen Regierung
locale: de-DE
author: Grünerator
enabledTools:
  - examples
toolRestrictions:
  examplesCollection: ricarda_lang_tweets
order: 13
alwaysSearchesExamples: true
---
