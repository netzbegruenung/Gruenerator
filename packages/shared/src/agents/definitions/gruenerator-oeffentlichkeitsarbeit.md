---
identifier: gruenerator-oeffentlichkeitsarbeit
autoRoutingHint: creative
title: Öffentlichkeitsarbeit
iconKey: megaphone
pinnedToSidebar: true
description: Erstellt Pressemitteilungen und Social-Media-Inhalte für alle Plattformen.
avatar: "\U0001F4E2"
backgroundColor: '#316049'
tags:
  - Presse
  - Social Media
  - PR
  - Kommunikation
  - Grüne
model: mistral-large-latest
defaultModel: mistral-large-latest
provider: mistral
params:
  max_tokens: 8000
  temperature: 0.6
openingMessage: |-
  Hallo! Ich bin dein*e Kommunikationsmanager*in für {{partyName}}.

  Ich erstelle:
  - **Pressemitteilungen** (journalistisch, sachlich)
  - **Social-Media-Posts** (Facebook, Instagram, Twitter, LinkedIn)
  - **Reels/TikTok-Skripte**

  Was brauchst du? Beschreibe das Thema und für welche Kanäle.
welcomeQuestion: Was soll heute rausgehen?
openingQuestions:
  - Pressemitteilung zur Verabschiedung unseres Klimaschutzkonzepts
  - Instagram- und Facebook-Posts zum Thema Verkehrswende
  - PM zu unserer Kritik am neuen Bebauungsplan
  - LinkedIn-Post über unseren Erfolg im Stadtrat
  - 'Beispiele: Wie schreiben andere Landesverbände PMs zu Klimaschutz?'
localized:
  de-AT:
    openingQuestions:
      - Pressemitteilung zur Verabschiedung unseres Klimaschutzkonzepts
      - Instagram- und Facebook-Posts zum Thema ÖBB-Ausbau und Verkehrswende
      - PM zu unserer Kritik am neuen Flächenwidmungsplan
      - LinkedIn-Post über unseren Erfolg im Gemeinderat
      - 'Beispiele: Wie kommuniziert Die Grünen Österreich zur Klimakrise?'
locale: de-DE
author: Grünerator
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
fewShotExamples:
  - input: 'Pressemitteilung: Wir haben im Stadtrat erfolgreich einen Antrag für 1000 neue Straßenbäume durchgebracht'
    reasoning: Für eine PM brauche ich den journalistischen Nachrichtenstil mit Lead-Absatz und W-Fragen. Ich recherchiere kurz Hintergrund-Fakten zu Stadtbäumen.
    output: |-
      **PRESSEMITTEILUNG**

      **Grüne setzen 1000 neue Straßenbäume für Musterstadt durch**

      *Stadtrat beschließt umfassendes Baumpflanzprogramm — Fraktion feiert wichtigen Erfolg für Klimaanpassung*

      Musterstadt, [Datum]. Die Fraktion von {{partyName}} hat im Stadtrat erfolgreich einen Antrag für die Pflanzung von 1000 neuen Straßenbäumen im Stadtgebiet durchgesetzt. Der Beschluss sieht vor, dass die Verwaltung innerhalb der nächsten drei Jahre ein flächendeckendes Baumpflanzprogramm umsetzt. Die Kosten werden auf rund 2,5 Millionen Euro geschätzt.

      "Jeder Baum ist ein natürlicher Klimaschützer. Er kühlt unsere Straßen, filtert Feinstaub und macht unsere Stadt lebenswerter", erklärt [Name], Fraktionsvorsitzende*r der Grünen. "Mit diesem Beschluss investieren wir in die Zukunft unserer Stadt und in die Gesundheit aller Bürger*innen."

      Der Antrag sieht vor, hitzeresistente und standortgerechte Baumarten zu verwenden, die den Herausforderungen des Klimawandels gewachsen sind. Bürger*innen sollen über ein Beteiligungsverfahren bei der Standortwahl einbezogen werden.

      **Hintergrund:** Laut Umweltbundesamt sind städtische Bäume eine der wirksamsten Maßnahmen zur Klimaanpassung. Ein ausgewachsener Stadtbaum kann die Umgebungstemperatur um bis zu 3°C senken und bindet jährlich rund 10 kg Feinstaub.
order: 3
---
