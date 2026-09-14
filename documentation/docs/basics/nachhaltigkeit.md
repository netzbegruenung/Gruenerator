---
sidebar_position: 4
title: Wie nachhaltig ist der Grünerator?
description: 'Wie wir den Ressourcenverbrauch von KI verringern, messen und transparent machen.'
---

# Wie nachhaltig ist der Grünerator?

Künstliche Intelligenz braucht Strom, Wasser und Hardware. Das lässt sich nicht wegreden. Der Grünerator ist deshalb so gebaut, dass er Ressourcen spart, europäische Infrastruktur bevorzugt und die verbleibenden Auswirkungen transparent macht.

## Weniger Rechenaufwand, wo er keinen Nutzen bringt

Nicht jede Aufgabe braucht dieselbe Rechenleistung. Der Grünerator ordnet Anfragen ein und setzt für einfache Schritte kleinere, schnellere KI ein. Anspruchsvollere Aufgaben erhalten nur dann mehr Rechenleistung, wenn sie davon wirklich profitieren. Auch Werkzeuge wie Suche oder Dokumentenerstellung werden gezielt eingesetzt.

Das spart Zeit, Kosten und Energie – ohne Nutzer:innen dazu zu drängen, ihre Arbeit künstlich kurz zu halten.

## Europäische Infrastruktur und Anbieter

Unsere eigene Plattform – Web-Oberfläche, Datenbanken und Suche – läuft bei [Hetzner](https://docs.hetzner.com/de/general/company-and-policy/sustainability-at-hetzner/) in Deutschland. Hetzner gibt für seine deutschen Standorte erneuerbare Wasserkraft und einen durchschnittlichen PUE-Wert von 1,13 an. Der PUE beschreibt, wie viel zusätzliche Energie ein Rechenzentrum neben der eigentlichen Rechenarbeit benötigt: Je näher er an 1 liegt, desto effizienter ist die Infrastruktur.

Für KI-Anfragen arbeiten wir mit europäischen Anbietern. Sie verarbeiten die jeweiligen Inhalte innerhalb Europas; Details zu den Auftragsverarbeitern und den Datenflüssen stehen in unserer [Datenschutzerklärung](https://gruenerator.de/datenschutz). Welche Technik im Hintergrund eingesetzt wird, kann sich ändern – deshalb veröffentlichen wir hier bewusst keine kurzlebigen Listen einzelner Modelle.

## Wir messen, statt nur zu behaupten

Wo Anbieter die Umweltwirkung einer Anfrage direkt zurückmelden, übernehmen wir diese Werte. Das gilt für GreenPT und jetzt auch für Melious: Beide liefern Energieverbrauch und CO₂-Emissionen zusammen mit der jeweiligen Antwort.

Für Anfragen ohne solche Messwerte schätzen wir den Verbrauch anhand der tatsächlich erzeugten und eingelesenen Tokens. Die verwendeten Faktoren beruhen auf eigenen Messreihen vergleichbarer KI-Systeme. Standort, Rechenzentrum und technische Auslastung können wir dabei nicht immer vollständig sehen. Deshalb behandeln wir Schätzungen als Schätzungen und zeigen Unsicherheit nicht als Scheingenauigkeit.

Unsere Hauptzahl orientiert sich am Strommix am Ort des Rechenzentrums. Zusätzlich berücksichtigen wir, wenn ein Anbieter nachweislich erneuerbaren Strom beschafft. Beides ist relevant: Ein Ökostromvertrag unterstützt den Ausbau erneuerbarer Energien, der lokale Strommix beschreibt jedoch die physische Versorgung zum Zeitpunkt der Anfrage.

## So entsteht eine Zahl

Die [Transparenz-Seite](https://gruenerator.eu/transparenz) veröffentlicht die Eingaben und das Ergebnis je Anbieter. Damit lässt sich nachvollziehen, wie eine Summe zustande kommt, ohne technische Modellnamen kennen zu müssen.

1. **Direkt gemessene Anfragen:** Wir übernehmen die Energie und CO₂-Werte aus der Antwort des Anbieters. `1 kWh = 1.000 Wh`; die CO₂-Angabe wird unverändert in Gramm ausgewiesen.
2. **Geschätzte Textanfragen:** Für jede Anfrage rechnen wir `Energie = Eingabe-Tokens × Eingabe-Faktor + Ausgabe-Tokens × Ausgabe-Faktor + Anfragen × Grundwert`. Ausgabe-Tokens zählen deutlich stärker, weil das Erzeugen einer Antwort mehr Rechenzeit benötigt als das Einlesen einer Anfrage.
3. **Rechenzentrum:** Der geschätzte Energiebedarf wird mit dem PUE des Rechenzentrums korrigiert. Ist kein PUE veröffentlicht, kennzeichnen wir den standortbasierten Ersatzwert als Schätzung.
4. **CO₂:** `CO₂ = Energie in kWh × Netzintensität in g CO₂/kWh`. Die Transparenz-Seite zeigt für jeden Anbieter die verwendete Netzintensität und den PUE direkt neben dessen Anteil.

Für direkt gemessene Anfragen fallen keine zusätzlichen Annahmen an. Für geschätzte Anfragen zeigt die Transparenz-Seite getrennt, welcher Anteil gemessen, mit einem kalibrierten Faktor geschätzt oder noch nicht bewertbar ist. Wo die Einordnung nur eine plausible Bandbreite zulässt, veröffentlichen wir Untergrenze, Mittelwert und Obergrenze statt einer einzelnen scheinpräzisen Zahl.

Die Methode bleibt bei einem Wechsel der eingesetzten Technik gleich: Neue Systeme liefern entweder eigene Messwerte oder erhalten vor dem Einsatz ein versioniertes Berechnungsprofil. Die Seite zeigt immer die aktuellen Summen und Annahmen aus dem laufenden System – nicht eine von Hand gepflegte Modellliste.

## Zwei Begriffe, die unsere Rechnung beeinflussen

**PUE (Power Usage Effectiveness)** beschreibt die Effizienz eines Rechenzentrums. Ein PUE von 1,0 hieße: Jeder Watt Strom versorgt direkt die IT. Bei einem PUE von 1,25 kommen auf 100 Watt Rechenarbeit weitere 25 Watt für Kühlung, Stromversorgung und andere Infrastruktur hinzu. Darum rechnen wir den PUE in die Energie einer Anfrage ein.

**Netzintensität** meint hier nicht die Auslastung des Internets, sondern den CO₂-Gehalt des Stromnetzes: Wie viele Gramm CO₂ bei einer Kilowattstunde Strom am Rechenzentrumsstandort entstehen. Dieser Wert kann je Land, Region und Tageszeit schwanken – etwa wenn viel Wind- oder Solarstrom verfügbar ist. GreenPT erklärt diesen Ansatz und seine PUE-Werte auf seiner [Nachhaltigkeitsseite](https://greenpt.com/sustainability); dort werden für einzelne Rechenzentren auch stündliche CO₂-Daten genutzt. Wo wir einen direkt gemessenen Anbieterwert erhalten, übernehmen wir ihn. Andernfalls verwenden wir die dokumentierte standortbasierte Netzintensität und weisen die Unsicherheit aus.

## Was die Zahlen abdecken – und was nicht

Unsere Bilanz erfasst vor allem den Strombedarf während der Nutzung. Nicht vollständig enthalten sind:

- Herstellung und Entsorgung von Hardware
- Training der KI-Systeme
- Grundverbrauch von Infrastruktur, die unabhängig von einer einzelnen Anfrage läuft
- Bereiche, für die uns noch keine belastbaren Messwerte vorliegen, etwa Teile von Suche und Transkription. Diese zählen wir als Aktivität, aber nicht stillschweigend als „null CO₂“.

Die ausgewiesenen Werte sind daher eine Untergrenze, keine vollständige Lebenszyklusbilanz.

## Transparenz statt individuellem CO₂-Konto

Unter **Einstellungen → Nutzung** siehst du deine Aktivitäten und einen Vergleich mit einer vergleichbaren Nutzung von ChatGPT. Eine persönliche Gramm-Zahl zeigen wir bewusst nicht: Die entscheidenden Architektur- und Routing-Entscheidungen treffen wir, nicht einzelne Nutzer:innen.

Die absolute Wirkung der Plattform veröffentlichen wir auf der [Transparenz-Seite](https://gruenerator.eu/transparenz). Dort zeigen wir Energie und CO₂ über den gesamten Grünerator, nach Bereichen aufgeschlüsselt und mit erkennbaren Unsicherheiten. Das hilft uns, die Infrastruktur und das Routing laufend zu verbessern.

## Quellen und Weiteres

- [Hetzner: Nachhaltigkeit](https://www.hetzner.com/de/unternehmen/nachhaltigkeit)
- [GreenPT: Sustainability](https://docs.greenpt.ai/sustainability)
- [Melious: Environmental impact](https://melious.ai/docs/get-started/quickstart#read-the-whole-response)
- [GHG Protocol: Scope 2 Guidance](https://ghgprotocol.org/scope-2-guidance)
- [Grünerator Pro-EU](./gruenerator-pro-eu.md)

:::info[Ehrlich bleiben]
Auch KI mit erneuerbarer Energie verbraucht Ressourcen. Nachhaltigkeit bedeutet für uns nicht „folgenlos“, sondern: möglichst sparsam bauen, nachvollziehbar messen und bei neuen Daten besser werden.
:::
