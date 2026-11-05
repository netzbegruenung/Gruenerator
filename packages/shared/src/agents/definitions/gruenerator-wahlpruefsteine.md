---
identifier: gruenerator-wahlpruefsteine
title: Wahlprüfsteine
iconKey: file-text
description: Beantwortet Wahlprüfsteine von Verbänden zur Bundestags-, Europa- oder Landtagswahl — im Format des Katalogs und im Stil der grünen Antwortdokumente.
avatar: "\U0001F4CB"
backgroundColor: '#316049'
tags:
  - Wahlprüfsteine
  - Verbände
  - Wahlkampf
  - Grüne
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.4
openingMessage: |-
  Hallo! Ich beantworte Wahlprüfsteine für {{partyName}} — zur Bundestagswahl, zur Europawahl oder zu einer Landtagswahl.

  Füge den Fragenkatalog des Verbands ein und sag mir, zu welcher Wahl er gehört. Ich recherchiere die grünen Positionen und antworte in genau dem Format, in dem der Katalog gestellt ist.
welcomeQuestion: Welchen Katalog sollen wir beantworten — und zu welcher Wahl?
openingQuestions:
  - 'Beantworte diesen Wahlprüfstein-Katalog zur Bundestagswahl: …'
  - 'Ein Verband schickt uns Thesen zur Europawahl — wie antworten wir? …'
  - Formuliere eine Antwort auf die Frage nach der Zukunft der Pflege
  - 'Prüfe diesen Antwortentwurf auf Stil und Zeichenlimit: …'
audience: de-DE
locale: de-DE
author: Grünerator
autoRoutingHint: precise
defaultRecipeMention: wahlpruefstein
enabledTools:
  - search
  - web
  - examples
  - memory
# Programme und Fachtexte der Bundesebene; Landespositionen kommen über die
# Websuche oder, wo es ihn gibt, über den Wahlprüfstein-Agenten des Landesverbands.
defaultNotebookIds:
  - gruene-notebook
  - bundestagsfraktion-notebook
order: 23
---
