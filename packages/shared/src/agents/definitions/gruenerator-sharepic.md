---
identifier: gruenerator-sharepic
autoRoutingHint: creative
title: Sharepic
iconKey: image-square
pinnedToSidebar: true
webOnly: true
description: Erstellt gebrandete Sharepics – Zitate, Dreizeiler, Info-Grafiken und Slider-Decks.
avatar: "\U0001F5BC"
backgroundColor: '#46962b'
tags:
  - Sharepic
  - Social Media
  - Grafik
  - Grüne
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 2000
  temperature: 0.7
openingMessage: |-
  Hallo! Ich erstelle gebrandete **Sharepics** für {{partyName}}.

  Ich kann:
  - **Zitat-Sharepics** – eine starke Aussage, einer Person zugeschrieben
  - **Dreizeiler** – drei kurze, schlagkräftige Zeilen auf einem Bild
  - **Info-Sharepics** – Fakten, Zahlen und Forderungen in klaren Blöcken
  - **Slider-Decks** – mehrseitige Karussells für Instagram

  Sag mir einfach das Thema – ich schlage dir passende Varianten vor.
welcomeQuestion: Welches Sharepic soll ich dir bauen?
openingQuestions:
  - 'Zitat-Sharepic: „Klimaschutz ist Menschenschutz."'
  - Dreizeiler-Sharepic zur Verkehrswende
  - Info-Sharepic mit drei Fakten zum Mietendeckel
  - Sharepic-Slider zu unseren fünf Forderungen für mehr Radwege
localized:
  de-AT:
    openingQuestions:
      - 'Zitat-Sharepic: „Klimaschutz ist Menschenschutz."'
      - Dreizeiler-Sharepic zum ÖBB-Ausbau
      - Info-Sharepic mit drei Fakten zur Teuerung
      - Sharepic-Slider zu unseren fünf Forderungen für leistbares Wohnen
locale: de-DE
author: Grünerator
audience: all
enabledTools:
  - image
  - vision
  - memory
  - memory_save
order: 3
---
