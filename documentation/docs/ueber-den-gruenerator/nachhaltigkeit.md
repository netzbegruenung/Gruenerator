---
sidebar_position: 4
title: Wie nachhaltig ist der Grünerator?
---

{/*
Modell-Stand aus dem Code (bei Änderungen dort auch hier nachziehen):

- apps/api/routes/chat/agents/providers.ts (AVAILABLE_MODELS, VISION_MODEL, LOOP_PLANNER__, LOOP_SYNTH__)
- apps/api/services/ai/providers.ts (INTERMEDIATE_MODEL, PROVIDER_DEFAULTS)
- apps/api/services/flux/FluxImageService.ts (BFL EU-Endpunkt, flux-2-pro)
- apps/api/services/flux/RegoloImageService.ts (Qwen-Image)
- apps/api/services/subtitler/regoloTranscriptionService.ts (faster-whisper-large-v3)
- apps/api/services/mistral/MistralEmbeddingService/ (mistral-embed)
- apps/api/services/usage/energyFootprint.ts (Energie-Koeffizienten, Netzintensitäten)
  */}

# Wie nachhaltig ist der Grünerator?

Künstliche Intelligenz kostet Strom, Wasser und Hardware — das lässt sich nicht wegdiskutieren. Der Grünerator ist deshalb so gebaut, dass er **möglichst wenig davon braucht** und den Rest aus **möglichst sauberen Quellen** bezieht. Drei Hebel machen den Unterschied:

1. **Grünes Hosting** — die Server laufen mit erneuerbarer Energie.
2. **Sparsame Modelle** — kleine und mittlere Modelle statt Frontier-Giganten.
3. **Intelligentes Routing** — jede Anfrage bekommt nur so viel Rechenleistung, wie sie wirklich braucht.

## Grünes Hosting: Wasserkraft statt Kohlestrom

Der Grünerator selbst — Web-Oberfläche, Datenbanken, Suche — läuft bei **[Hetzner](https://docs.hetzner.com/de/general/company-and-policy/sustainability-at-hetzner/)** in Deutschland. Hetzner betreibt seine deutschen Standorte nach eigenen Angaben mit **100 % Wasserkraft**, ist EMAS- und ISO-14001-zertifiziert und erreicht mit einem durchschnittlichen PUE-Wert von **1,13** eine überdurchschnittliche Energieeffizienz (je näher an 1,0, desto weniger Strom geht für Kühlung und Infrastruktur verloren). Gegenüber dem deutschen Durchschnitts-Strommix spart das laut Hetzner rund **77.000 Tonnen CO₂ pro Jahr**.

Auch die **selbst gehosteten Open-Source-Modelle** (GPT-OSS und Gemma 4), die netzbegrünung e.V. und die verdigado eG für den Grünerator betreiben, laufen auf dieser Wasserkraft-Infrastruktur.

## Sparsame Modelle statt Größenwahn

Die größten kommerziellen KI-Modelle brauchen für jede einzelne Antwort ein Vielfaches der Energie eines kompakten Modells. Der Grünerator setzt deshalb bewusst auf **kleine und mittlere Modelle** — vom 31-Milliarden-Parameter-Modell Gemma 4 bis zum mittelgroßen Mistral Medium. Das sind die Modelle, die tatsächlich im Einsatz sind:

| Aufgabe                              | Modell                                                         | Läuft bei                                      |
| ------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------- |
| Chat & Texte (Standard)              | Mistral Medium 3.5 (`mistral-medium-2604`)                     | Mistral AI 🇫🇷                                  |
| Kreativtexte, Antworten schreiben    | Gemma 4 — 31 Mrd. Parameter (`gemma4-31b`)                     | verdigado 🇩🇪 / Regolo 🇮🇹                       |
| Schnelle Antworten                   | GPT-OSS 120B (`gpt-oss-120b`)                                  | verdigado 🇩🇪 / Regolo 🇮🇹                       |
| Anfragen einordnen, Zwischenschritte | Mistral Small 4 (`mistral-small-4-119b`)                       | Regolo 🇮🇹                                      |
| Werkzeuge planen und aufrufen        | Mistral Small (`mistral-small-latest`)                         | Mistral AI 🇫🇷                                  |
| Bilder verstehen                     | Gemma 4 (`gemma4-31b`), Pixtral Large                          | Regolo 🇮🇹 / Mistral AI 🇫🇷                      |
| Bilder erzeugen & bearbeiten         | FLUX 2 Pro (`flux-2-pro`), Qwen-Image                          | Black Forest Labs 🇩🇪 (EU-Endpunkt) / Regolo 🇮🇹 |
| Untertitel & Transkription           | Whisper Large v3 (`faster-whisper-large-v3`), Fallback Voxtral | Regolo 🇮🇹 / Mistral AI 🇫🇷                      |
| Suche & Notebooks (Embeddings)       | `mistral-embed`                                                | Mistral AI 🇫🇷                                  |

Wer mag, kann im Chat zusätzlich Qwen 3.5 (`qwen3.5-122b`) über Regolo wählen. Kein einziges dieser Modelle spielt in der Größenklasse der energiehungrigsten Frontier-Modelle — und für die Aufgaben im politischen Alltag reicht das nicht nur, es ist oft sogar die bessere Wahl, weil kleinere Modelle schneller antworten.

## Intelligentes Routing: nur so viel KI wie nötig

Der Grünerator schickt nicht jede Anfrage an das größte verfügbare Modell. Stattdessen entscheidet ein **kompaktes Einordnungs-Modell** (Mistral Small 4 bei Regolo) zuerst, was überhaupt gebraucht wird: eine einfache Antwort, eine Recherche, ein Dokument, ein Bild.

Auch innerhalb einer Antwort ist die Arbeit geteilt: Ein **kleines, schnelles Modell** übernimmt das Planen und Aufrufen von Werkzeugen (Suche, Notebooks, Dokumente), und ein **kompaktes 31-Milliarden-Modell** schreibt den Text. Das große Standardmodell kommt nur dort zum Einsatz, wo seine Qualität wirklich gebraucht wird. So bleibt der Energieverbrauch pro Anfrage niedrig, ohne dass die Qualität leidet.

## Unsere Anbieter im Nachhaltigkeits-Check

### Regolo (Seeweb, Italien) — 100 % erneuerbar

**[Regolo](https://regolo.ai/sustainable-ai/)** betreibt seine GPU-Server nach eigenen Angaben mit **100 % erneuerbarer Energie**, verzichtet auf Wasserkühlung und führt Hardware im Kreislauf (wiederverwenden, aufarbeiten, recyceln). Das Unternehmen ist ISO-14001-zertifiziert, Qualified Supporter der Green Web Foundation und arbeitet nach dem europäischen DNSH-Prinzip („Do No Significant Harm", EU-Taxonomie) — alles in europäischen Rechenzentren, mit Zero Data Retention. Beim Grünerator übernimmt Regolo die Anfragen-Einordnung (`mistral-small-4-119b`), das Schreiben von Antworten (`gemma4-31b`), Transkription (`faster-whisper-large-v3`) und dient als Überlauf für die selbst gehosteten Modelle.

### GreenPT — grüne Entwicklung

**[GreenPT](https://greenpt.com/sustainability)** rechnet ausschließlich in EU-Rechenzentren mit **100 % erneuerbarer Energie** — in Paris sowie in Helsinki (je zur Hälfte Wasser- und Windkraft) — und nennt konkrete Effizienzwerte: PUE 1,25 (Branchenschnitt: 1,55) und ein Wasserverbrauch (WUE) von 0,25 statt branchenüblicher 1,8. Der Grünerator nutzt GreenPT als Modell-Lane in der **Entwicklungsumgebung** (`gemma4`) — auch das Testen neuer Funktionen läuft damit grün.

### Mistral AI (Frankreich) — Transparenz-Vorreiter

**[Mistral AI](https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai/)** vermarktet sich nicht als Öko-Anbieter, hat aber als erstes KI-Unternehmen überhaupt eine **vollständige, unabhängig geprüfte Lebenszyklus-Analyse** eines eigenen Modells veröffentlicht — erstellt mit der französischen Umweltagentur ADEME und Carbone 4, peer-reviewed nach ISO 14040/44. Die Zahlen machen KI-Umweltkosten erstmals konkret vergleichbar: Eine typische Antwort (400 Token) verursacht etwa **1,14 g CO₂e und 45 ml Wasser**. Mistral setzt sich zudem für einen verbindlichen globalen Umweltstandard für KI ein. Dazu kommt der französische Strommix, der zu den CO₂-ärmsten Europas gehört. Beim Grünerator liefert Mistral das Standardmodell (`mistral-medium-2604`), die Werkzeug-Planung, die Embeddings für Suche und Notebooks sowie den Transkriptions-Fallback Voxtral.

### Black Forest Labs (Freiburg) — Bilder aus der EU

**[Black Forest Labs](https://bfl.ai/)** aus Freiburg entwickelt die FLUX-Bildmodelle. Der Grünerator nutzt ausschließlich den **EU-Endpunkt** (`api.eu.bfl.ai`) mit `flux-2-pro` — die Bilderzeugung läuft damit im europäischen Strommix, der deutlich CO₂-ärmer ist als der US-amerikanische, wo die meisten Bild-KIs rechnen.

## Was dein eigener Verbrauch kostet

Unter **Einstellungen → Nutzung** siehst du Energie- und CO₂-Verbrauch deiner eigenen Anfragen. Diese Zahl ist teils gemessen, teils hochgerechnet — hier steht, wie sie zustande kommt.

### Woher die Messwerte kommen

Von unseren Anbietern liefert nur **GreenPT** die Umweltkosten einer Anfrage mit: Jede Antwort trägt ein `impact`-Objekt mit Energieverbrauch und Emissionen. Diese Werte übernehmen wir unverändert.

Für alle anderen rechnen wir hoch — mit Werten, die an **genau denselben Modellen** gemessen wurden. GreenPT betreibt Gemma 4, GPT-OSS 120B und Mistral Medium 3.5 ebenfalls, also verrät eine Messung dort, was dasselbe Modell bei Regolo oder verdigado kostet. Gemessen am 31.07.2026 über 35 Läufe mit unterschiedlich langen Antworten:

| Modell                        | Energie je erzeugtem Token | typische Antwort (400 Token) |
| ----------------------------- | -------------------------- | ---------------------------- |
| Mistral Small 3.2 (24 Mrd.)   | 0,70 mWh                   | 0,28 Wh                      |
| Gemma 4 (31 Mrd.)             | 0,72 mWh                   | 0,29 Wh                      |
| GPT-OSS 120B                  | 0,81 mWh                   | 0,34 Wh                      |
| Mistral Medium 3.5 (128 Mrd.) | 4,52 mWh                   | 1,84 Wh                      |
| Qwen 3.5 (397 Mrd.)           | 7,47 mWh                   | 3,08 Wh                      |

Das ist die harte Zahl unter dem, was weiter oben über sparsame Modelle steht: **Mistral Medium braucht das 6,3-fache von Gemma 4**, das größte gemessene Modell das 10,3-fache. Genau deshalb schreibt bei uns ein kompaktes Modell die Antworten.

Nebenbei zeigt die Messung, dass der **Prompt fast nichts kostet**: Ein gesendetes Token verbraucht 100- bis 760-mal weniger Energie als ein erzeugtes. Lange Kontexte sind ökologisch billig, lange Antworten nicht.

### Wie wir Emissionen berechnen

Emissionen sind Energie mal Kohlenstoffintensität des Stroms. Wir rechnen **standortbasiert**, also mit dem realen Strommix am jeweiligen Rechenzentrumsstandort — nicht mit unseren Ökostromverträgen.

Das ist bewusst die strengere Variante, und wir folgen damit GreenPT selbst: Der Anbieter wirbt mit 100 % erneuerbarer Energie und rechnet seine Emissionen trotzdem nicht auf null, sondern nutzt stündliche Netzdaten je Standort. Ein Ökostromvertrag ändert nichts daran, welcher Strom im selben Moment physisch durch die Leitung fließt. Die grüne Beschaffung bleibt richtig und wirksam — sie ist nur kein Rabatt auf die Bilanz.

Wir rechnen mit diesen Werten (Jahresmittel 2024, nur Verbrennungsemissionen):

| Standort                            | g CO₂/kWh | Quelle                                           |
| ----------------------------------- | --------- | ------------------------------------------------ |
| Scaleway (Paris)                    | 24        | Scaleway Impact Report 2025, eigene Scope-2-Zahl |
| Frankreich (Mistral)                | 22        | RTE, Bilan électrique 2024                       |
| Italien (Regolo/Seeweb)             | 270       | Ember, Yearly Electricity Data                   |
| Deutschland (verdigado auf Hetzner) | 363       | Umweltbundesamt                                  |

Bei Scaleway müssen wir nicht auf den Landesdurchschnitt ausweichen: Der Impact Report weist Scope 2 standortbasiert mit 3.155 t CO₂e bei 132.881 MWh aus — macht 23,7 g/kWh aus erster Hand.

Dazu kommt die Effizienz des Rechenzentrums selbst (PUE — wie viel Strom zusätzlich für Kühlung und Infrastruktur draufgeht). GreenPTs Messwerte enthalten einen PUE von 1,25; wo unsere Anbieter besser sind, rechnen wir die Differenz gut: Hetzner gibt 1,13 an (Spanne 1,10–1,16), Seeweb unter 1,20.

**Ein Glücksfall für die Genauigkeit:** GreenPT rechnet selbst bei Scaleway in Paris („Every GreenPT request runs on Scaleway's 100 % renewable-powered compute in Paris"), und Scaleway stellt sämtliche KI-Server in ein einziges Rechenzentrum — DC5, PUE 1,25. Unser Standardmodell Mistral Medium läuft ebenfalls über Scaleway. Für dieses Modell ist unsere Messung also **keine Übertragung auf fremde Hardware**, sondern dieselbe Maschinenklasse im selben Gebäude. Nur für die Gemma- und GPT-OSS-Lanes bei Regolo und verdigado bleibt es eine Übertragung — dort ist das „≈" wörtlich zu nehmen.

Eine Unschärfe bleibt und sei benannt: Der deutsche Wert des Umweltbundesamts ist verbrauchsbasiert (Stromimporte eingerechnet), die französische und italienische Zahl sind erzeugungsbasiert. Italien importiert viel französischen Atomstrom, sein verbrauchsbasierter Wert läge also **unter** 270. Der Fehler geht damit zu Lasten Italiens, nicht zu seinen Gunsten.

### Warum Ökostrom die Zahl nicht auf null bringt

Alle drei Anbieter beziehen nach eigenen Angaben erneuerbare Energie — Seeweb ausschließlich, Hetzner seit 2008 Wasserkraft, Scaleway zu 100 %. Trotzdem steht in unserer Rechnung der jeweilige Netzmix. Das ist keine Nachlässigkeit, sondern der Punkt.

**Scaleway macht es selbst genau so.** Der Impact Report weist den Ökostrom ausdrücklich als _Guarantee of Origin_ aus, also als Herkunftsnachweise — und rechnet die Emissionen trotzdem standortbasiert. Ein Anbieter, der sich mit einem Federstrich auf nahe null hätte rechnen können, tut es nicht. Dem folgen wir.

Bei **Regolo** kommt hinzu, dass es gar keine Zahl gäbe, die man einsetzen könnte: Der Nachhaltigkeitsbericht der DHH-Gruppe 2024 nennt für Seeweb zwar 7,3 GWh Stromverbrauch und null Prozent fossilen Anteil, hält aber fest, dass die Gruppengesellschaften ihre Treibhausgasemissionen **derzeit nicht messen** („the Group companies do not currently measure greenhouse gas emissions"). Bei **Hetzner** ist es dasselbe Bild — die Nachhaltigkeitsseite nennt PUE und Wasserkraft, aber keine Scope-2-Bilanz.

Wo Berichte konkret werden, rechnen wir es an: Seewebs PUE unter 1,20 und Hetzners 1,13 senken beide Werte gegenüber unserem Referenzwert. Sobald einer der beiden eine Scope-2-Bilanz veröffentlicht, nehmen wir sie auf — bei Scaleway ist genau das schon passiert.

### Modelle ohne Messwert: Obergrenze statt Schätzung

Für einige Lanes betreibt GreenPT kein Gegenstück — Mistral Small 4 (119 Mrd.), Qwen 3.5 (122 Mrd.) und Pixtral Large. Sie einfach wegzulassen wäre die bequemste Lösung und die falscheste: Bei realer Nutzung läuft ein Großteil des Volumens genau dort.

Über die **Modellgröße** lässt sich das nicht schätzen — die Messreihe widerlegt den Zusammenhang direkt: GPT-OSS mit 120 Mrd. Parametern verbraucht je Token weniger als ein Sechstel von Mistral Medium mit 128 Mrd.

Wir haben deshalb einen zweiten Weg geprüft: **Antwortgeschwindigkeit als Energie-Proxy**. Auf identischer Regolo-Hardware sollte ein Modell, das doppelt so lange für ein Token braucht, ungefähr doppelt so viel ziehen. Als Kontrolle haben wir den Proxy an zwei Modellen getestet, deren Energieverbrauch wir _kennen_:

|                             | Verhältnis GPT-OSS 120B zu Gemma 4 |
| --------------------------- | ---------------------------------- |
| laut Geschwindigkeits-Proxy | 0,43×                              |
| laut Messung                | 1,12×                              |

**Der Proxy lag um 62 % daneben — und zwar in der schmeichelhaften Richtung.** Geschwindigkeit sagt vor allem, über wie viele GPUs ein Modell verteilt ist, nicht wie viel es zieht. Die daraus abgeleiteten Zahlen haben wir verworfen.

Was bleibt, ist die gemessene Spanne dieser Größenklasse: 0,81 mWh je Token (GPT-OSS, Mixture-of-Experts) bis 4,52 mWh (Mistral Medium, dicht). Wir setzen für die ungemessenen Lanes das **obere Ende** an. Das ist bewusst zu hoch gegriffen — bei einer Umweltangabe ist das die richtige Fehlerrichtung. Die Nutzungs-Übersicht weist getrennt aus, welcher Anteil deiner Zahl auf einer solchen Obergrenze beruht, und dieser Anteil wird kleiner, sobald jemand die Lane wirklich misst. Nach oben korrigiert er sich nie.

### Erzeugte Bilder

Ein einzelnes Bild wiegt schwerer als alles andere in der Übersicht: **Ein Sharepic mit Flux Pro entspricht rund 25 erzeugten Pressemitteilungen.** Deshalb zeigt die Übersicht den Bildanteil getrennt an — eine Summe allein würde nahelegen, dass Chatten das Problem ist.

Auch hier meldet kein Anbieter Messwerte, und GreenPT betreibt kein Bildmodell, mit dem wir kalibrieren könnten. Die Werte stammen aus einer veröffentlichten Messreihe: **Iyengar et al. (2025)** vermessen gängige Diffusionsmodelle auf einer A100 über das gesamte Raster aus Auflösung, Schritten, Rechengenauigkeit und Guidance. Genau das macht die Arbeit brauchbar — wir können die Zelle nehmen, die zu unserer Nutzung passt, statt eine Schlagzeile zu zitieren. Bei 1024×1024, 50 Schritten, fp16, mit CFG:

| Modell                        | Energie je Bild (nur GPU) |
| ----------------------------- | ------------------------- |
| Qwen-Image (läuft bei Regolo) | 3,58 Wh                   |
| FLUX.1 [dev]                  | 4,28 Wh                   |

**Zwei Korrekturen sind nötig, bevor man das übernehmen darf.** Erstens misst die Arbeit ausschließlich die GPU und zieht deren Leerlauf ab. In einem echten Rechenzentrum zahlt man beides: den Leerlauf ohnehin, dazu CPU, Arbeitsspeicher, Netzwerk, Lüfter und Verluste im Netzteil — Beschleuniger machen typischerweise nur gut die Hälfte der Serverleistung aus. Wir verdoppeln deshalb. Das ist eine runde Zahl und offen eine Setzung, deshalb steht sie hier und nicht nur im Code. Zweitens kommt die Effizienz des Rechenzentrums obendrauf; wo ein Betreiber nichts veröffentlicht, rechnen wir mit dem Weltdurchschnitt von 1,56.

Beim Strommix gilt dasselbe Prinzip. Black Forest Labs bedienen wir über den EU-Endpunkt `api.eu.bfl.ai`; der verweist auf Azure Front Door, die Bilder entstehen also in Microsofts europäischer Infrastruktur. Das nennt aber nur den Betreiber, nicht den Standort: Front Door ist der Netzwerk-Eingang, nicht der Rechner — in welcher Azure-Region das Modell läuft, ist von außen nicht erkennbar.

Wir setzen deshalb den **deutschen Netzmix** an. Unter den Azure-Regionen in Europa, die KI-Kapazität haben, liegen Frankreich und Schweden deutlich darunter, die Niederlande und Irland ungefähr gleichauf. Der Wert liegt damit am ungünstigen Ende des Plausiblen und klar über dem EU-Schnitt — die richtige Richtung, solange der Standort unbekannt ist.

Nur eine der Lanes ist damit gut abgedeckt: **Qwen-Image bei Regolo ist exakt das vermessene Modell**, und Regolo geht ohnehin nicht über 1024×1024 hinaus — die gemessene Zelle ist also zugleich der schlechteste Fall. Bei **Black Forest Labs** liegt FLUX.2 vor, vermessen wurde FLUX.1; die drei Varianten skalieren wir über den von BFL selbst veröffentlichten Kostenfaktor (Klein 0,5×, Pro 1×, Max 2×). Alle Bildwerte gelten daher als **Obergrenze**, nicht als Messung.

Zur Einordnung von außen: Scope3 veranschlagt für ein hochwertiges GPT-4o-Bild rund 5,6 g CO₂e, das entspricht am US-Netz etwa 14,7 Wh. Unser Flux-Pro-Wert landet bei rund 10,7 Wh — gleiche Größenordnung aus völlig anderer Methode.

### Was die Zahl _nicht_ enthält

- **Keine Herstellung, kein Training.** Wir zählen den Strom der Anfrage selbst. Der CO₂-Rucksack aus GPU-Produktion und Modelltraining fehlt.
- **Keine Transkription, keine Recherche.** Dafür liefert kein Anbieter Messwerte — GreenPTs Transkriptions-Endpunkt etwa gibt gar kein `impact`-Feld zurück. Diese Schritte fehlen vollständig.

Wie groß der fehlende Teil ist, zeigt Scaleways eigene Bilanz besonders klar: Dem Betriebsstrom (Scope 2) mit 3.155 t CO₂e stehen **13.387 t allein für die Server** gegenüber — die Hardware-Herstellung wiegt dort das **4,2-fache** des Stroms, den sie verbraucht. Mistrals unabhängig geprüfte Ökobilanz kommt in dieselbe Richtung: Sie nennt für eine 400-Token-Antwort rund 1,14 g CO₂e, wo unsere Rechnung für ein vergleichbares Modell bei etwa 0,10 g landet.

**Wer eine vollständige Bilanz will, muss unsere Zahl als Untergrenze lesen** — die Größenordnung des Fehlenden liegt eher beim Vier- bis Zehnfachen als bei ein paar Prozent.

### Was dieselbe Arbeit mit ChatGPT gekostet hätte

Die Nutzungs-Übersicht stellt deinem Verbrauch eine Vergleichszahl gegenüber. Sie beruht auf **Jegham et al. (2025)** — der einzigen veröffentlichten Rechnung zu GPT-4o mit **derselben Systemgrenze wie unserer**: nur Betriebsstrom, kein Training, keine Hardware-Herstellung, PUE eingerechnet, standortbasierter Emissionsfaktor. Alles andere wäre ein Vergleich von Äpfeln mit Birnen.

Für eine Kurzanfrage (100 Token rein, 300 raus) nennt die Arbeit 0,42 Wh und damit rund 147 mg CO₂e. Unsere Modelle in derselben Konfiguration:

| Modell und Standort         | Energie | CO₂    |
| --------------------------- | ------- | ------ |
| Gemma 4 bei Regolo          | 0,21 Wh | 56 mg  |
| GPT-OSS 120B bei Regolo     | 0,24 Wh | 66 mg  |
| Gemma 4 bei verdigado       | 0,20 Wh | 71 mg  |
| Mistral Medium bei Scaleway | 1,37 Wh | 30 mg  |
| **GPT-4o (Jegham et al.)**  | 0,42 Wh | 147 mg |

Daraus ergibt sich die Spanne, die die Übersicht zeigt: **rund 2- bis 5-mal weniger CO₂** je vergleichbarer Anfrage.

Der Vergleich gilt **nur für Text**. Für erzeugte Bilder gibt es keine OpenAI-Zahl mit vergleichbar sauber benannter Systemgrenze; eine Herstellerschätzung gegen eine grenzkorrigierte Messung zu stellen würde die Sorgfalt entwerten, um die es hier geht. Bilder bleiben im Vergleich deshalb außen vor.

Zwei Ehrlichkeiten gehören dazu. Erstens: **Beim Strom gewinnen wir nicht durchgehend.** Die kompakten Modelle liegen knapp doppelt so gut, unser Standardmodell Mistral Medium aber gut dreimal schlechter. Dass es beim CO₂ trotzdem den besten Wert erzielt, verdankt sich dem französischen Netz — nicht sparsamerer Technik. Zweitens: **Die GPT-4o-Zahl ist selbst nur geschätzt.** OpenAI veröffentlicht nichts; sie wurde aus Antwortzeiten, GPU-Datenblättern und einer statistisch erschlossenen Hardware-Annahme abgeleitet. Unsere Zahlen kommen von einem Zähler. Die Unsicherheit sitzt fast vollständig auf der anderen Seite.

## Quellen

Alle Zahlen dieser Seite sind nachprüfbar.

**Unsere Anbieter**

- [Scaleway Impact Report 2025](https://www-uploads.scaleway.com/Impact_Report2025_22ee3a8232.pdf) — Scope 1/2/3, PUE je Rechenzentrum, WUE
- [Hetzner: Nachhaltigkeit](https://www.hetzner.com/de/unternehmen/nachhaltigkeit) — PUE 1,10–1,16, Wasserkraft seit 2008, EMAS
- [DHH Group Sustainability Report 2024](https://www.dhh.international/wp-content/uploads/2025/04/DHH_sustainability-report-2024_21-03-2025.pdf) — Seeweb (Regolo), Stromverbrauch und PUE
- [GreenPT: Sustainability](https://docs.greenpt.ai/sustainability) — Methode der CO₂-Berechnung, stündliche Netzdaten von Nodera
- [GreenPT: Partner](https://greenpt.com/partners) — Infrastruktur läuft bei Scaleway in Paris
- [Regolo: Sustainable AI](https://regolo.ai/sustainable-ai/)
- [Mistral AI: Ökobilanz mit ADEME und Carbone 4](https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai/)

**Strommix**

- [Umweltbundesamt: CO₂-Emissionen pro Kilowattstunde Strom](https://www.umweltbundesamt.de/themen/co2-emissionen-pro-kilowattstunde-strom-2024) — Deutschland, verbrauchsbasiert
- [RTE: Bilan électrique](https://analysesetdonnees.rte-france.com/en/annual-review-2024/keyfindings) — Frankreich
- [Ember: Yearly Electricity Data](https://ember-energy.org/data/yearly-electricity-data/) — Italien und Ländervergleich

**Methode und Vergleichszahlen**

- [Jegham et al., „How Hungry is AI?" (arXiv:2505.09598)](https://arxiv.org/abs/2505.09598) — Grundlage des ChatGPT-Vergleichs
- [Iyengar et al., „Energy Scaling Laws for Diffusion Models" (arXiv:2511.17031)](https://arxiv.org/abs/2511.17031) — Grundlage der Bildwerte; Tabelle 3 (FLUX.1) und Tabelle 6 (Qwen-Image)
- [Scope3: Sustainable AI — Image Generation](https://info.scope3.com/hubfs/Sustainable%20AI%20-%20Image%20Gen%20Report.pdf) — unabhängige Gegenprobe für Bilder
- [Uptime Institute Global Data Center Survey](https://uptimeinstitute.com/resources/research-and-reports/uptime-institute-global-data-center-survey-results-2024) — weltweiter PUE-Durchschnitt 1,56
- [GHG Protocol Scope 2 Guidance](https://ghgprotocol.org/scope-2-guidance) — standortbasiert vs. marktbasiert
- Unsere eigene Messreihe ist im Code dokumentiert und wiederholbar: `apps/api/services/usage/energyFootprint.ts` und `apps/api/scripts/probeGreenptImpact.ts`

:::info[Ehrlich bleiben]
Die genannten Zahlen sind Anbieterangaben (Stand Juli 2026). Und auch grüne KI verbraucht Ressourcen — Nachhaltigkeit heißt beim Grünerator nicht „kostenlos für die Umwelt", sondern: bewusst kleine Modelle, bewusst grüne Anbieter, bewusst europäische Infrastruktur.
:::

Warum die Anbieter außerdem alle in Europa sitzen, liest du unter [Grünerator Pro-EU](./gruenerator-pro-eu.md).
