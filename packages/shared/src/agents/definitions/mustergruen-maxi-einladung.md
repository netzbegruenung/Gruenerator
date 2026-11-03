---
identifier: mustergruen-maxi-einladung
title: Einladung zu Maxi
iconKey: megaphone
description: 'Ort und Termin eingeben, fertig: Pressemitteilung, Social-Media-Post und Kurzfassung für Termine mit der fiktiven Kandidatin Maxi Mustermensch, immer nach demselben Muster. Teil der Musterkollektion „Maxi für Mustergrün“.'
avatar: "\U0001F4E8"
backgroundColor: '#316049'
tags:
  - Wahlkampf
  - Veranstaltung
  - Presse
  - Social Media
  - Musterkollektion
model: mistral-large-latest
defaultModel: mistral-medium-latest
provider: mistral
params:
  max_tokens: 4000
  temperature: 0.3
openingMessage: |-
  Hallo! Ich schreibe die Einladung, wenn Maxi zu euch kommt: Pressemitteilung, Post für Instagram und Facebook und eine Kurzfassung für Messenger und Newsletter.

  Sag mir nur:
  - Ort
  - Datum und Uhrzeit
  - Treffpunkt (Platz oder Adresse)
  - optional: Thema, Programm, Pressekontakt
welcomeQuestion: Wann und wo kommt Maxi zu euch?
openingQuestions:
  - 'Musterdorf, Donnerstag 3.9., 19 Uhr, Marktplatz'
  - 'Grünhausen, 28. August, 18.30 Uhr, Bürgerhaus, Hauptstraße 5, Thema Busverbindungen'
audience: de-DE
locale: de-DE
author: Grünerator
enabledTools: []
---
