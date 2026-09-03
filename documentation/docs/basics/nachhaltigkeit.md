---
sidebar_position: 4
title: Wie nachhaltig ist der Grünerator?
description: 'Wie viel Strom und CO₂ eine Anfrage kostet, wie wir das rechnen und wie der Vergleich mit ChatGPT zustande kommt.'
---

import { ModelTable } from '@site/src/components/ModelTable';
import { ProviderTasks } from '@site/src/components/ProviderTasks';

{/*
Welches Modell wo läuft, steht NICHT in dieser Datei — und WELCHER ANBIETER
WELCHE AUFGABE hat, ebenfalls nicht: <ModelTable /> und <ProviderTasks host="…" />
rendern beide src/generated/models.json, und das liest scripts/generate-models.mjs aus dem
Routing-Code selbst (AVAILABLE_MODELS, INTERMEDIATE_LANES, LOOP_PLANNER_PRIMARY,
ARTIFACT_MODEL, VISION_MODEL, MODEL_OPTIONS, TRANSCRIPTION_CHAIN). Umzug einer
Lane -> `pnpm --filter @gruenerator/documentation models:generate`; `models:check`
bricht die CI, wenn es jemand vergisst. Neues Modell ohne lesbaren Namen: eine
Zeile in MODEL_LABELS, der Generator sagt welche.

Weiter von Hand gepflegt (Messwerte, keine Routing-Fakten):

- apps/api/services/usage/energyFootprint.ts (Energie-Koeffizienten, Netzintensitäten)
- apps/web/src/utils/usageFormat.ts (Darstellung: Einheiten, Rundung, Vergleichsrechnung)
- apps/web/src/features/settings/tabs/UsageTab.tsx (Nutzung-Tab — zeigt bewusst KEINEN eigenen Fußabdruck)
- apps/web/src/features/monitor/components/TransparenzView.tsx (Transparenz-Seite, Plattformzahl)
  */}

# Wie nachhaltig ist der Grünerator?

Künstliche Intelligenz kostet Strom, Wasser und Hardware — das lässt sich nicht wegdiskutieren. Der Grünerator ist deshalb so gebaut, dass er **möglichst wenig davon braucht** und den Rest aus **möglichst sauberen Quellen** bezieht. Drei Hebel machen den Unterschied:

1. **Grünes Hosting** — die Server laufen mit erneuerbarer Energie.
2. **Sparsame Modelle** — kleine und mittlere Modelle statt Frontier-Giganten.
3. **Intelligentes Routing** — jede Anfrage bekommt nur so viel Rechenleistung, wie sie wirklich braucht.

## Grünes Hosting: Wasserkraft statt Kohlestrom

Der Grünerator selbst — Web-Oberfläche, Datenbanken, Suche — läuft bei **[Hetzner](https://docs.hetzner.com/de/general/company-and-policy/sustainability-at-hetzner/)** in Deutschland. Hetzner betreibt seine deutschen Standorte nach eigenen Angaben mit **100 % Wasserkraft**, ist EMAS- und ISO-14001-zertifiziert und erreicht mit einem durchschnittlichen PUE-Wert von **1,13** eine überdurchschnittliche Energieeffizienz (je näher an 1,0, desto weniger Strom geht für Kühlung und Infrastruktur verloren). Gegenüber dem deutschen Durchschnitts-Strommix spart das laut Hetzner rund **77.000 Tonnen CO₂ pro Jahr**.

Die **selbst gehosteten Open-Source-Modelle**, die netzbegrünung e.V. und die verdigado eG betreiben, liefen ebenfalls auf dieser Wasserkraft-Infrastruktur. Seit dem **29.08.2026 bedienen sie keine Anfrage des Grünerators mehr** — die Infrastruktur, Datenbank und Suche laufen unverändert dort weiter.

Der Rückzug ging in drei Schritten, und alle drei hatten denselben Grund: Die selbst gehostete Instanz denkt vor jeder Antwort nach, und kein Schalter stellte das ab — rund zwei Drittel der Ausgabe gingen in einen Denkblock, den niemand angefordert hatte.

1. **31.07.2026 — Gemma 4 zog zu Regolo nach Italien.** Dieselben Gewichte antworten dort neunmal schneller, weil sie den Denkblock nicht schreiben.
2. **19.08.2026 — der Ausweichweg fiel weg.** Die Instanz hat einen einzigen Inferenz-Platz, den sie sich mit den übrigen Lanes teilte: als Regolo an diesem Tag hustete, war der Ausweg belegt und beide Wege standen still.
3. **29.08.2026 — die letzte Lane, GPT-OSS 120B, zog ab.** Auch sie schrieb ihr Denken gegen das Antwortbudget. Bei einer Chat-Überschrift mit einem Budget von 64 Tokens war das Budget aufgebraucht, bevor die Überschrift anfing. Diese Aufgaben laufen jetzt auf **Mistral Small 3.2** über **Cortecs**; derselbe Aufruf braucht dort 8 statt 64 Tokens.

Die Rechnung geht damit in beide Richtungen: Der Strom war grüner als fast überall sonst, aber ein Denkblock, den niemand liest, ist verbrauchte Energie ohne Gegenwert.

## Sparsame Modelle statt Größenwahn

Die größten kommerziellen KI-Modelle brauchen für jede einzelne Antwort ein Vielfaches der Energie eines kompakten Modells. Der Grünerator setzt deshalb bewusst auf **kleine und mittlere Modelle** — kein einziges davon spielt in der Größenklasse der Frontier-Modelle. Welche es gerade genau sind, ändert sich mehrmals im Jahr; diese Tabelle wird direkt aus dem Routing-Code erzeugt und zeigt deshalb immer den aktuellen Stand, nicht den von Hand nachgepflegten:

<ModelTable />

Im Chat selbst stehen drei Größen zur Wahl — **Klein**, **Mittel** und **Ultra**; welche Modelle dahinterstehen, sind die ersten drei Zeilen oben. Kein einziges dieser Modelle spielt in der Größenklasse der energiehungrigsten Frontier-Modelle — und für die Aufgaben im politischen Alltag reicht das nicht nur, es ist oft sogar die bessere Wahl, weil kleinere Modelle schneller antworten.

## Intelligentes Routing: nur so viel KI wie nötig

Der Grünerator schickt nicht jede Anfrage an das größte verfügbare Modell. Stattdessen entscheidet ein **kompaktes Einordnungs-Modell** zuerst, was überhaupt gebraucht wird: eine einfache Antwort, eine Recherche, ein Dokument, ein Bild.

Auch innerhalb einer Antwort ist die Arbeit geteilt: Ein **kleines, schnelles Modell** übernimmt das Planen und Aufrufen von Werkzeugen (Suche, Notebooks, Dokumente), ein **kompaktes Modell** schreibt den Text. Das große Standardmodell kommt nur dort zum Einsatz, wo seine Qualität wirklich gebraucht wird. So bleibt der Energieverbrauch pro Anfrage niedrig, ohne dass die Qualität leidet.

## Unsere Anbieter im Nachhaltigkeits-Check

### Regolo (Seeweb, Italien) — 100 % erneuerbar

**[Regolo](https://regolo.ai/sustainable-ai/)** betreibt seine GPU-Server nach eigenen Angaben mit **100 % erneuerbarer Energie**, verzichtet auf Wasserkühlung und führt Hardware im Kreislauf (wiederverwenden, aufarbeiten, recyceln). Das Unternehmen ist ISO-14001-zertifiziert, Qualified Supporter der Green Web Foundation und arbeitet nach dem europäischen DNSH-Prinzip („Do No Significant Harm", EU-Taxonomie) — alles in europäischen Rechenzentren, mit Zero Data Retention.

<ProviderTasks host="Regolo" />

Transkription lief hier bis Juli 2026 ebenfalls; Regolos eigene Hinweise begrenzten sie auf zwei Minuten pro Datei, und an einem 180-Sekunden-Ausschnitt wiederholte das Modell tatsächlich einen ganzen Satz. Seitdem läuft sie über Anbieter ohne diese Einschränkung.

### GreenPT — Dokumente und Ausweichweg

**[GreenPT](https://greenpt.com/sustainability)** rechnet ausschließlich in EU-Rechenzentren mit **100 % erneuerbarer Energie** — in Paris sowie in Helsinki (je zur Hälfte Wasser- und Windkraft) — und nennt konkrete Effizienzwerte: PUE 1,25 (Branchenschnitt: 1,55) und ein Wasserverbrauch (WUE) von 0,25 statt branchenüblicher 1,8.

<ProviderTasks host="GreenPT" />

Dass die **erzeugten Dateien** — PDFs, Präsentationen, Tabellen und Dokumente — hier laufen, ist keine Verlegenheitslösung, sondern gemessen: Am 03.08.2026 gegen die echten Prompts und Vorlagen rief das große Standardmodell das nötige Werkzeug in keinem einzigen Lauf sauber auf und lief in Wiederholungen fest, GreenPTs Modell in zehn von zehn Läufen — und dabei drei- bis viermal schneller. Als frei wählbare Chat-Lane ist GreenPT im Code fertig verdrahtet, im Modellwähler aber noch nicht freigeschaltet — deshalb steht sie oben nicht bei den drei wählbaren Lanes.

### Mistral AI (Frankreich) — Transparenz-Vorreiter

**[Mistral AI](https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai/)** vermarktet sich nicht als Öko-Anbieter, hat aber als erstes KI-Unternehmen überhaupt eine **vollständige, unabhängig geprüfte Lebenszyklus-Analyse** eines eigenen Modells veröffentlicht — erstellt mit der französischen Umweltagentur ADEME und Carbone 4, peer-reviewed nach ISO 14040/44. Die Zahlen machen KI-Umweltkosten erstmals konkret vergleichbar: Eine typische Antwort (400 Token) verursacht etwa **1,14 g CO₂e und 45 ml Wasser**. Mistral setzt sich zudem für einen verbindlichen globalen Umweltstandard für KI ein. Dazu kommt der französische Strommix, der zu den CO₂-ärmsten Europas gehört.

<ProviderTasks host="Mistral AI" />

### Black Forest Labs (Freiburg) — Bilder aus der EU

**[Black Forest Labs](https://bfl.ai/)** aus Freiburg entwickelt die FLUX-Bildmodelle. Der Grünerator nutzt ausschließlich den **EU-Endpunkt** (`api.eu.bfl.ai`) — die Bilderzeugung läuft damit im europäischen Strommix, der deutlich CO₂-ärmer ist als der US-amerikanische, wo die meisten Bild-KIs rechnen.

<ProviderTasks host="Black Forest Labs" />

### Cortecs — der Vermittler, und die ehrliche Lücke

**Cortecs** ist kein Rechenzentrum, sondern ein **Vermittler**: Es reicht eine Anfrage an einen von mehreren Unteranbietern weiter. Wir schränken diese Auswahl vertraglich auf solche ein, die in der EU sitzen und dort reguliert sind und **Zero Data Retention** zusichern — und weil eine Weisung allein nichts beweist, prüfen wir jede Antwort nach: Cortecs nennt in einem Kopffeld, wer tatsächlich gerechnet hat, und ein Name außerhalb unserer Positivliste wird als Fehler protokolliert. Auch die Verbrauchsbuchhaltung läuft auf diesen Namen, nicht auf „Cortecs".

In der Praxis rechnet dort **Infercom SCS** — Sitz in Luxemburg, Verarbeitung laut Cortecs-Vertrag in Deutschland. Ein zweiter Endpunkt desselben Modells liegt bei **Berget AI** (Schweden); der Router wählt ihn von sich aus bisher nicht.

<ProviderTasks host="Cortecs" />

Hier ist die Bilanz schlechter belegt als bei allen anderen auf dieser Seite, und das soll so dastehen: Für Infercom ist uns weder ein PUE-Wert noch ein Herkunftsnachweis für Ökostrom bekannt. Wir rechnen deshalb mit dem **deutschen Strommix** (344 g CO₂e/kWh, Umweltbundesamt 2025) und rechnen keinen Ökostrom an — die vorsichtige Lesart, nicht die günstige. Ein fremdes Zertifikat zu erben wäre derselbe Fehler wie bei Black Forest Labs weiter unten. Legt der Anbieter einen Nachweis vor, sinkt die Zahl; solange nicht, steht sie so in der Rechnung.

## Wie wir rechnen

Unter **Einstellungen → Nutzung** siehst du, was du gemacht hast — Anfragen, Tokens, Bilder, Transkriptionen, Recherchen, Sprachausgabe — und daneben, wie viel CO₂ dieselbe Arbeit auf ChatGPT gekostet hätte. Was **du** verbraucht hast, zeigen wir dort bewusst nicht.

Das ist eine Entscheidung, keine Auslassung. Wie viel eine Anfrage kostet, hängt fast vollständig davon ab, welches Modell wo läuft und an welchem Netz das Rechenzentrum hängt — und das entscheiden wir, nicht du. Eine persönliche Gramm-Zahl macht eine einzelne Person für eine Architekturentscheidung verantwortlich, die sie nicht getroffen hat, und legt nahe, weniger zu fragen, wo eigentlich wir sparsamer bauen müssen. Die absolute Zahl gehört deshalb dorthin, wo sie hingehört: auf die **[Transparenz-Seite](https://gruenerator.eu/transparenz)**, die den Verbrauch der ganzen Plattform ausweist.

Die Zahlen unten erklären trotzdem beides — die Ersparnis im Nutzung-Tab und die Plattformzahl entstehen aus derselben Rechnung.

### Warum keine Nachkommastellen

Keine dieser Zahlen trägt eine Nachkommastelle. Der Fußabdruck ruht auf Modellkoeffizienten aus einer Messreihe und, wo die fehlt, auf der Mitte zwischen zwei gemessenen Modellen — ein Zehntelgramm ist eine Auflösung, die diese Rechnung nicht hergibt. „154 g" sagt dasselbe wie „154,1 g", nur ohne eine Genauigkeit zu behaupten, die es nicht gibt. Die Einheit wechselt erst bei 10 kg von Gramm auf Kilogramm, weil „1 kg" für 1400 g ein Drittel wegrunden würde, um einen Dezimalpunkt zu vermeiden.

### Woher die Messwerte kommen

Von unseren Anbietern liefert nur **GreenPT** die Umweltkosten einer Anfrage mit: Jede Antwort trägt ein `impact`-Objekt mit Energieverbrauch und Emissionen. Diese Werte übernehmen wir unverändert.

Für alle anderen rechnen wir hoch — mit Werten, die an **genau denselben Modellen** gemessen wurden. GreenPT betreibt Gemma 4, GPT-OSS 120B und Mistral Medium 3.5 ebenfalls, also verrät eine Messung dort, was dasselbe Modell bei Regolo oder Cortecs kostet. Gemessen am 31.07.2026 über 35 Läufe mit unterschiedlich langen Antworten:

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

Emissionen sind Energie mal Kohlenstoffintensität des Stroms. Dafür gibt es zwei anerkannte Methoden, und das GHG-Protokoll verlangt ausdrücklich **beide**. Wir weisen seit August 2026 auch beide aus: die **standortbasierte** Zahl mit dem realen Strommix am Rechenzentrumsstandort ist unsere Bilanz und die Zahl, die überall groß steht. Die **marktbasierte** Zahl, die den bezogenen Ökostrom anrechnet, bildet das günstige Ende der angezeigten Spanne. Nie eine ohne die andere.

Das ist bewusst die strengere Variante, und wir folgen damit GreenPT selbst: Der Anbieter wirbt mit 100 % erneuerbarer Energie und rechnet seine Emissionen trotzdem nicht auf null, sondern nutzt stündliche Netzdaten je Standort. Ein Ökostromvertrag ändert nichts daran, welcher Strom im selben Moment physisch durch die Leitung fließt. Die grüne Beschaffung bleibt richtig und wirksam — sie ist nur kein Rabatt auf die Bilanz.

Wir rechnen mit diesen Werten (Jahresmittel 2024, nur Verbrennungsemissionen):

| Standort                          | g CO₂/kWh | Quelle                                             |
| --------------------------------- | --------- | -------------------------------------------------- |
| Scaleway (Paris)                  | 24        | Scaleway Impact Report 2025, eigene Scope-2-Zahl   |
| Frankreich … Schweden (Mistral)   | 19,6 … 45 | RTE Bilan électrique 2025 · Ember — Mitte **30**   |
| Italien (Regolo/Seeweb)           | 270       | Ember, Yearly Electricity Data                     |
| Luxemburg / Deutschland (Cortecs) | 344       | Umweltbundesamt 2025 (Verarbeitung in Deutschland) |

Bei Scaleway müssen wir nicht auf den Landesdurchschnitt ausweichen: Der Impact Report weist Scope 2 standortbasiert mit 3.155 t CO₂e bei 132.881 MWh aus — macht 23,7 g/kWh aus erster Hand.

Dazu kommt die Effizienz des Rechenzentrums selbst (PUE — wie viel Strom zusätzlich für Kühlung und Infrastruktur draufgeht). GreenPTs Messwerte enthalten einen PUE von 1,25; wo unsere Anbieter besser sind, rechnen wir die Differenz gut: Hetzner gibt 1,13 an, Seeweb unter 1,20. Wo ein Betreiber gar keinen PUE veröffentlicht, schätzen wir ihn — siehe unten.

**Ein Glücksfall für die Genauigkeit:** GreenPT rechnet selbst bei Scaleway in Paris („Every GreenPT request runs on Scaleway's 100 % renewable-powered compute in Paris"), und Scaleway stellt sämtliche KI-Server in ein einziges Rechenzentrum — DC5, PUE 1,25. Für die Lanes, die **bei GreenPT** laufen, ist unsere Messung deshalb **keine Übertragung auf fremde Hardware**, sondern dieselbe Maschinenklasse im selben Gebäude.

Für alle anderen ist es eine Übertragung, und dort ist das „≈" wörtlich zu nehmen. Diese Seite zählt nicht mehr auf, welche Lane das gerade betrifft — die Zuordnung ändert sich zu oft, und eine Aufzählung, die niemand nachzieht, ist schlechter als keine. Wer sie braucht, liest die Tabelle oben: alles, was dort **nicht** bei GreenPT steht, ist eine Übertragung. Bis August 2026 lief zusätzlich das Zusammenfassen langer Dokumente bei Scaleway und fiel damit ebenfalls unter den genauen Fall; heute nicht mehr. (Auch unser Standardmodell lief eine Zeitlang über Scaleway; wir haben es wegen fehlerhafter Antworten dieses Anbieters wieder direkt zum Hersteller gelegt.)

### Mitte statt Obergrenze — und die Spanne dazu

Überall, wo wir schätzen müssen, zeigen wir seit dem 29.08.2026 einen **mittleren Wert** und daneben die **Spanne**, in der er sitzt. Vorher stand an diesen Stellen die Obergrenze allein.

Der Wechsel ist keine Beschönigung, sondern die Korrektur eines zweiten Fehlers. Auf jede Unsicherheit nach oben zu runden liest sich wie Vorsicht, verhält sich aber wie eine Verzerrung: Die Zahl ist dann verlässlich falsch, und zwar immer in dieselbe Richtung — und weil mehrere solcher Aufschläge sich multiplizieren, wächst der Fehler mit jeder Unsicherheit, die man ehrlich benennt. Wer vorsichtig sein will, wird dafür bestraft.

Dazu kam ein Ungleichgewicht, das erst beim Nachrechnen auffiel: Die Aufschläge lagen alle auf der **Energie**-Seite, während auf der **Kohlenstoff**-Seite eine Annahme in die Gegenrichtung lief (nur Verbrennungsemissionen, siehe oben). Die Rechnung war also nicht durchgehend streng, sondern streng beim Strom und großzügig beim CO₂ — was niemand beabsichtigt hatte und was in keiner der beiden Richtungen als Vorsicht durchgeht.

Was die Spanne trägt und was nicht, steht ausdrücklich dabei: Wo eine Lane gemessen und das Land des Anbieters bekannt ist, fallen beide Enden zusammen und es gibt nichts zu zeichnen. **Die Breite der Skala ist genau die Unsicherheit, die wir wirklich haben** — sie schrumpft, sobald jemand misst.

### Wenn ein Betreiber keinen PUE veröffentlicht

Drei Anbieter nennen keinen: Mistral, Infercom und Berget. Bis August 2026 fiel die Rechnung dort still auf GreenPTs 1,25 zurück — also auf den Wert eines fremden, besonders effizienten Rechenzentrums. Die Transparenz-Seite hat ihn danebengeschrieben, als hätte der Anbieter ihn genannt. Das war falsch, und zwar in die schmeichelnde Richtung.

Jetzt schätzen wir stattdessen über den **Standort** und weisen die Schätzung als Schätzung aus (auf der Seite als „PUE geschätzt", mit einem ≈ vor der Zahl):

| Fall                              | Wert | Grundlage                                                                             |
| --------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| Rechenzentrum in Deutschland      | 1,5  | Obergrenze des Energieeffizienzgesetzes für Bestandsanlagen ab dem 01.07.2027         |
| Standort nur als „EU/EWR" bekannt | 1,50 | Uptime Institute, Global Data Center Survey 2025 — europäischer Durchschnitt, n = 134 |

Bewusst der **europäische** Durchschnitt und nicht der weltweite Wert derselben Erhebung (1,54 bei n = 681): Alle betroffenen Anbieter sind vertraglich auf den EWR festgelegt. Regionen mit schlechteren Werten — Naher Osten und Afrika melden 1,68 — würden unseren Fußabdruck mit Rechenzentren aufblähen, in denen niemand für uns rechnet. Vorsichtig schätzen heißt nicht, sich schlechter zu machen, als man belegen kann.

Beide Werte liegen weiterhin über dem, was ein modernes Rechenzentrum erreicht. Das ist Absicht: Wo wir nichts wissen, soll die Zahl eher zu groß als zu klein sein.

Eine Unschärfe bleibt und sei benannt: Der deutsche Wert des Umweltbundesamts ist verbrauchsbasiert (Stromimporte eingerechnet), die französische und italienische Zahl sind erzeugungsbasiert. Italien importiert viel französischen Atomstrom, sein verbrauchsbasierter Wert läge also **unter** 270. Der Fehler geht damit zu Lasten Italiens, nicht zu seinen Gunsten.

### Warum Ökostrom die Hauptzahl nicht auf null bringt — und wo er trotzdem auftaucht

Alle drei Anbieter beziehen zertifizierte erneuerbare Energie. Trotzdem steht in unserer **Hauptzahl** der jeweilige Netzmix. Das ist keine Nachlässigkeit, sondern der Punkt: Ein Ökostromvertrag ändert nichts daran, welcher Strom im selben Moment physisch durch die Leitung fließt.

**Scaleway macht es selbst genau so.** Der Impact Report weist den Ökostrom ausdrücklich als _Guarantee of Origin_ aus, also als Herkunftsnachweise — und rechnet die Emissionen trotzdem standortbasiert. Ein Anbieter, der sich mit einem Federstrich auf nahe null hätte rechnen können, tut es nicht. Dem folgen wir.

Ihn ganz zu verschweigen wäre allerdings die andere Hälfte derselben Unehrlichkeit. Zertifikate zu kaufen ist eine reale Handlung mit realer Wirkung auf den Ausbau. Deshalb zeigen wir die marktbasierte Rechnung als **günstiges Ende der Spanne**, ausdrücklich als zweite Methode gekennzeichnet — nicht als Unsicherheit und nie als Ersatz für die Hauptzahl.

Marktbasiert ist dabei nichts zu schätzen: Für Verbrauch, der durch entwertete Herkunftsnachweise gedeckt ist, gilt der Emissionsfaktor der vertraglich bezogenen Erzeugung, also null. Die einzige Frage je Anbieter ist der **Beleg**, und die Latte ist ein benanntes Instrument, kein grünes Selbstbild:

| Anbieter                       | Beleg                                                                                                                                  | Stärke                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Scaleway / GreenPT             | _Guarantee of Origin_ im Impact Report, dazu eigene standortbasierte Scope-2-Zahl                                                      | dokumentiert                                                                                           |
| Hetzner (Grünerator-Hosting)   | **EMAS-Registrierung** seit 2025 (Gunzenhausen, Nürnberg, Falkenstein); 100 % Erneuerbare in DE und FI                                 | am stärksten — staatlich zugelassener Gutachter prüft nach, aber **nur für Deutschland** (siehe unten) |
| Seeweb (Regolo)                | ISO 14001, „solo da fonti rinnovabili certificate", benannter Versorger, Green Web Foundation                                          | Selbstauskunft plus zertifiziertes Managementsystem                                                    |
| **Mistral AI**                 | **keiner** — Mistral wirbt nicht mit Ökostrom, und der französische Netzmix ist eine Aussage über das Netz, nicht über die Beschaffung | kein Anspruch                                                                                          |
| **Black Forest Labs (Bilder)** | **keiner** — läuft hinter Azure Front Door, die Region der Inferenz ist für uns unsichtbar                                             | kein Anspruch                                                                                          |

:::note Der EMAS-Nachweis endet an der deutschen Grenze

Hetzners EMAS-Registrierung deckt Gunzenhausen, Nürnberg und Falkenstein ab — den finnischen Datacenter-Park in Tuusula bei Helsinki **nicht**. Dort liegt eine ISO/IEC-27001-Zertifizierung vor, die sich auf Informationssicherheit bezieht, nicht auf Umweltmanagement; in der validierten Umwelterklärung taucht Helsinki nur im Firmenporträt auf, ohne eigene Strom- oder PUE-Zahlen. Eine Ausweitung ist öffentlich nicht angekündigt, der erste EMAS-Zyklus läuft bis 2028.

Für den Strom heißt das nicht „unbekannt": Hetzner gibt an, den finnischen Park seit seiner Errichtung 2018 vollständig mit Wasserkraft zu betreiben. Es heißt nur, dass diese Angabe eine **Selbstauskunft** ist — dieselbe Belegstufe wie bei Seeweb, nicht die geprüfte. Dasselbe gilt für den PUE von 1,13: auch er ist eine Kennzahl der deutschen Standorte.

Entscheidend ist, dass diese Liste nach **Anbieter** geht und nicht nach Art der Aufgabe. Es ist also nicht so, dass „Bilder" pauschal herausfielen: Regolo erzeugt mit Qwen-Image ebenfalls Bilder, und die laufen im selben zertifizierten Seeweb-Rechenzentrum wie die Textmodelle — sie tragen den Nachweis also mit. Heraus fällt allein **Black Forest Labs**. Für dessen Bilder sind beide Methoden identisch, und das ist die ehrliche Antwort: Wir können nicht einmal sagen, in welchem Land die GPU steht, also können wir dort auch keinen Ökostrom anrechnen — Microsofts eigene Beschaffung ist nicht unsere.

:::caution Die Spanne ist einseitig, und das muss man wissen

Am günstigen Ende rechnen wir **unseren** Ökostrom an, lassen die GPT-4o-Vergleichszahl aber standortbasiert stehen. Microsoft kauft ebenfalls Erneuerbare ein — deren Nachweise sind nur nicht unsere und dürfen von uns nicht verrechnet werden. Das günstige Ende vergleicht insofern zwei **Methoden**, nicht zwei Rechenzentren. Unsere Bilanz bleibt das ungünstige Ende.

Aus demselben Grund übernehmen wir **nicht**, wie Regolo es im eigenen Playground tut: Dort steht „Saved CO₂ 0,631 g" für eine Anfrage mit 1,804 kWh — das sind 350 g/kWh, also der EU-Durchschnitt, gegen den die eigene Erzeugung gerechnet wird. Das ist keine Bilanz, sondern eine vermiedene Emission gegenüber einem Netz, an dem der Anbieter gar nicht hängt.
:::

Wo Berichte konkret werden, rechnen wir es zusätzlich an: Seewebs PUE unter 1,20 und Hetzners 1,13 senken beide Werte gegenüber unserem Referenzwert. Bei Seeweb ist dabei zu beachten, dass die 1,2 laut eigener Seite in den _neuesten_ Serverfarmen erreicht werden — für die ältere Flotte dürfte der Wert höher liegen. Das ist die eine Stelle, an der unsere Annahme eher schmeichelt als vorsichtig ist.

Sobald Seeweb oder Hetzner eine standortbasierte Scope-2-Bilanz veröffentlichen, nehmen wir sie auf — bei Scaleway ist genau das schon passiert. Für Hetzner ist die EMAS-Umwelterklärung der wahrscheinlichste Ort dafür.

### Modelle ohne Messwert: die Mitte einer gemessenen Klammer

Für einige Lanes betreibt GreenPT kein Gegenstück — Mistral Small 4 (119 Mrd.) und Pixtral Large. Sie einfach wegzulassen wäre die bequemste Lösung und die falscheste: Bei realer Nutzung läuft ein Großteil des Volumens genau dort.

Über die **Modellgröße** lässt sich das nicht schätzen — die Messreihe widerlegt den Zusammenhang direkt: GPT-OSS mit 120 Mrd. Parametern verbraucht je Token weniger als ein Sechstel von Mistral Medium mit 128 Mrd.

Wir haben deshalb einen zweiten Weg geprüft: **Antwortgeschwindigkeit als Energie-Proxy**. Auf identischer Regolo-Hardware sollte ein Modell, das doppelt so lange für ein Token braucht, ungefähr doppelt so viel ziehen. Als Kontrolle haben wir den Proxy an zwei Modellen getestet, deren Energieverbrauch wir _kennen_:

|                             | Verhältnis GPT-OSS 120B zu Gemma 4 |
| --------------------------- | ---------------------------------- |
| laut Geschwindigkeits-Proxy | 0,43×                              |
| laut Messung                | 1,12×                              |

**Der Proxy lag um 62 % daneben — und zwar in der schmeichelhaften Richtung.** Geschwindigkeit sagt vor allem, über wie viele GPUs ein Modell verteilt ist, nicht wie viel es zieht. Die daraus abgeleiteten Zahlen haben wir verworfen.

Was bleibt, ist die gemessene Spanne dieser Größenklasse: 0,81 mWh je Token (GPT-OSS, Mixture-of-Experts) bis 4,52 mWh (Mistral Medium, dicht). Beide Enden sind **unsere eigenen Messungen bei GreenPT** — die ungemessene Lane leiht sich die Klammer, nicht eine Vermutung.

Bis August 2026 setzten wir dafür das **obere Ende** an. Das klang nach Vorsicht und war doch ein zweiter Fehler: Es machte die Zahl in einer vorhersagbaren Richtung falsch und versteckte gleichzeitig, wie breit die echte Unsicherheit ist — hinter einem einzelnen pessimistischen Punkt. Seit dem 29.08.2026 zeigen wir stattdessen die **Mitte mit beiden Enden daneben**.

Die Mitte ist das _geometrische_ Mittel der beiden Anker, nicht das arithmetische. Die Größe erstreckt sich über den Faktor 5,6, liegt also auf einer logarithmischen Skala; das arithmetische Mittel läge bauartbedingt näher an der Decke, dorthin gezogen vom einzelnen dichten Ausreißer. Das geometrische Mittel liegt da, wo „gleich weit von beiden Ankern" tatsächlich ist.

### Erzeugte Bilder

Ein einzelnes Bild wiegt schwerer als alles andere in der Übersicht: **Ein Sharepic mit Flux Pro entspricht rund 25 erzeugten Pressemitteilungen.** Deshalb zeigt die Übersicht den Bildanteil getrennt an — eine Summe allein würde nahelegen, dass Chatten das Problem ist.

Auch hier meldet kein Anbieter Messwerte, und GreenPT betreibt kein Bildmodell, mit dem wir kalibrieren könnten. Die Werte stammen aus einer veröffentlichten Messreihe: **Iyengar et al. (2025)** vermessen gängige Diffusionsmodelle auf einer A100 über das gesamte Raster aus Auflösung, Schritten, Rechengenauigkeit und Guidance. Genau das macht die Arbeit brauchbar — wir können die Zelle nehmen, die zu unserer Nutzung passt, statt eine Schlagzeile zu zitieren. Bei 1024×1024, 50 Schritten, fp16, mit CFG:

| Modell                        | Energie je Bild (nur GPU) |
| ----------------------------- | ------------------------- |
| Qwen-Image (läuft bei Regolo) | 3,58 Wh                   |
| FLUX.1 [dev]                  | 4,28 Wh                   |

**Zwei Korrekturen sind nötig, bevor man das übernehmen darf.** Erstens misst die Arbeit ausschließlich die GPU und zieht deren Leerlauf ab. In einem echten Rechenzentrum zahlt man beides: den Leerlauf ohnehin, dazu CPU, Arbeitsspeicher, Netzwerk, Lüfter und Verluste im Netzteil — Beschleuniger machen typischerweise nur gut die Hälfte der Serverleistung aus. Beides lässt sich beziffern statt raten: Der abgezogene Leerlauf macht 15–35 % dessen aus, was die Arbeit übrig ließ (eine A100 ruht bei 50–70 W und zieht unter Diffusionslast 250–400 W), und der Rest des Servers kostet das 1,67- bis 2,0-Fache des Chips (Beschleuniger sind typischerweise 50–60 % der Serverleistung). Ausmultipliziert ergibt das eine Klammer von **1,92 bis 2,70**, Mitte 2,28.

Bemerkenswert daran: Die frühere runde Verdopplung, die wir als bewusst vorsichtig beschrieben haben, liegt damit am **unteren** Rand des Plausiblen. Sie war nicht zu hoch gegriffen, sondern leicht zu günstig — die Bilder werden durch den Wechsel auf die Mitte teurer, nicht billiger. Zweitens kommt die Effizienz des Rechenzentrums obendrauf; wo ein Betreiber nichts veröffentlicht, schätzen wir sie über den Standort (siehe unten).

Beim Strommix gilt dasselbe Prinzip. Black Forest Labs bedienen wir über den EU-Endpunkt `api.eu.bfl.ai`; der verweist auf Azure Front Door, die Bilder entstehen also in Microsofts europäischer Infrastruktur. Das nennt aber nur den Betreiber, nicht den Standort: Front Door ist der Netzwerk-Eingang, nicht der Rechner — in welcher Azure-Region das Modell läuft, ist von außen nicht erkennbar.

Wir setzen deshalb den **deutschen Netzmix** an. Unter den Azure-Regionen in Europa, die KI-Kapazität haben, liegen Frankreich und Schweden deutlich darunter, die Niederlande und Irland ungefähr gleichauf. Der Wert liegt damit am ungünstigen Ende des Plausiblen und klar über dem EU-Schnitt — die richtige Richtung, solange der Standort unbekannt ist.

Eine der Lanes ist damit richtig gut abgedeckt: **Qwen-Image bei Regolo ist exakt das vermessene Modell — und zwar in exakt unserer Konfiguration.** Regolo bietet 256×256, 512×512 und 1024×1024 an, aber jedes unserer Bildformate hat eine Kante von mindestens 1024 Pixeln, und Anfragen ohne Maßangabe nutzen ohnehin den Standardwert. In der Praxis läuft damit **jedes** Bild bei 1024×1024 — genau der gemessenen Zelle. Die Schrittzahl geben wir nicht vor, und Qwen-Image nutzt standardmäßig 50 Schritte mit CFG, was ebenfalls passt. Unsicher bleibt hier nur noch unser eigener Faktor 2 und die Frage, wie sehr Regolos Hardware von einer A100 abweicht.

Bei den Flux-Werten gilt das nicht: Dorthin gehen die echten Bildmaße durch, und unser Instagram-Format hat rund 1,4-mal so viele Pixel wie die vermessene Zelle. Ein solches Bild kostet also mehr, als unsere Zahl sagt. Wir korrigieren das derzeit nicht, weil die Nutzungsdaten nur zählen, wie viele Bilder erzeugt wurden, nicht in welcher Größe. Bei **Black Forest Labs** liegt FLUX.2 vor, vermessen wurde FLUX.1; die drei Varianten skalieren wir über den von BFL selbst veröffentlichten Kostenfaktor (Klein 0,5×, Pro 1×, Max 2×). Alle Bildwerte gelten daher als **hergeleitet**, nicht als Messung — mit ihrer Spanne daneben.

Zur Einordnung von außen: Scope3 veranschlagt für ein hochwertiges GPT-4o-Bild rund 5,6 g CO₂e, das entspricht am US-Netz etwa 14,7 Wh. Unser Flux-Pro-Wert landet bei rund 10,7 Wh — gleiche Größenordnung aus völlig anderer Methode.

### Was die Zahl _nicht_ enthält

- **Keine Herstellung, kein Training.** Wir zählen den Strom der Anfrage selbst. Der CO₂-Rucksack aus GPU-Produktion und Modelltraining fehlt.
- **Keine Sprachausgabe.** KugelAudio veröffentlicht keine Verbrauchsdaten, und für Sprachsynthese gibt es keine veröffentlichte Messung, deren Systemgrenze zu unserer passt. Anders als bei der Transkription erfassen wir hier aber die **Dauer** — die Größe, mit der die Energie skalieren würde. Sobald jemand einen belastbaren Wert in Wattstunden je Sekunde erzeugter Sprache liefert, lässt sich der gesamte bisher erfasste Zeitraum rückwirkend bewerten, ohne dass Daten nachgetragen werden müssen. Für den Netzfaktor bräuchte es zusätzlich eine Spanne statt eines Punktwerts: KugelAudios Unterauftragnehmer-Register nennt für die Inferenz Verda AI (Finnland) und Nebius (Finnland, Frankreich) sowie Hetzner für GPU-Server (Deutschland); Polen kommt nur über Scaleway als allgemeine Infrastruktur ins Bild. Welcher Standort eine einzelne Anfrage bedient hat, legt der Anbieter nicht offen.
- **Keine Transkription, keine Recherche.** Dafür liefert kein Anbieter Messwerte. Bei GreenPT, das als einziges überhaupt misst, haben wir alle in Frage kommenden Endpunkte geprüft: Transkription (`/v1/listen`) und beide Suchendpunkte antworten ohne `impact`-Feld, und einen Endpunkt für den Konto-Gesamtverbrauch gibt es nicht. Gemessen wird dort ausschließlich Inferenz auf `/v1/chat/completions` und `/v1/embeddings`. Beide Schritte werden deshalb **gezählt, aber nicht bewertet** — die Übersicht weist sie getrennt aus, damit die Aktivität nicht so aussieht, als wäre sie kostenlos.
- **Kein Grundverbrauch der eigenen Infrastruktur.** Datenbanken, Cache, Vektorsuche und die API-Container laufen rund um die Uhr, unabhängig davon, ob jemand etwas erzeugt. Sie stecken in keiner dieser Zahlen.

Wie groß der fehlende Teil ist, zeigt Scaleways eigene Bilanz besonders klar: Dem Betriebsstrom (Scope 2) mit 3.155 t CO₂e stehen **13.387 t allein für die Server** gegenüber — die Hardware-Herstellung wiegt dort das **4,2-fache** des Stroms, den sie verbraucht. Mistrals unabhängig geprüfte Ökobilanz kommt in dieselbe Richtung: Sie nennt für eine 400-Token-Antwort rund 1,14 g CO₂e, wo unsere Rechnung für ein vergleichbares Modell bei etwa 0,10 g landet.

**Wer eine vollständige Bilanz will, muss unsere Zahl als Untergrenze lesen** — die Größenordnung des Fehlenden liegt eher beim Vier- bis Zehnfachen als bei ein paar Prozent.

### Was dieselbe Arbeit mit ChatGPT gekostet hätte

Die Nutzungs-Übersicht zeigt ausschließlich diese Differenz — den Betrag, um den dieselbe Arbeit auf ChatGPT teurer oder billiger gewesen wäre. Sie beruht auf **Jegham et al. (2025)** — der einzigen veröffentlichten Rechnung zu GPT-4o mit **derselben Systemgrenze wie unserer**: nur Betriebsstrom, kein Training, keine Hardware-Herstellung, PUE eingerechnet, standortbasierter Emissionsfaktor. Alles andere wäre ein Vergleich von Äpfeln mit Birnen.

Für eine Kurzanfrage (100 Token rein, 300 raus) nennt die Arbeit 0,42 Wh und damit rund 147 mg CO₂e. Unsere Modelle in derselben Konfiguration:

| Modell und Standort          | Energie | CO₂    |
| ---------------------------- | ------- | ------ |
| Gemma 4 bei Regolo           | 0,21 Wh | 56 mg  |
| GPT-OSS 120B bei Regolo      | 0,24 Wh | 66 mg  |
| Mistral Medium in Frankreich | 1,37 Wh | 30 mg  |
| **GPT-4o (Jegham et al.)**   | 0,42 Wh | 147 mg |

Daraus ergibt sich die Spanne, die die Übersicht zeigt: **rund 2- bis 5-mal weniger CO₂** je vergleichbarer Anfrage.

Der Vergleich gilt **nur für Text**. Für erzeugte Bilder gibt es keine OpenAI-Zahl mit vergleichbar sauber benannter Systemgrenze; eine Herstellerschätzung gegen eine grenzkorrigierte Messung zu stellen würde die Sorgfalt entwerten, um die es hier geht. Bilder bleiben im Vergleich deshalb außen vor.

Zwei Ehrlichkeiten gehören dazu. Erstens: **Beim Strom gewinnen wir nicht durchgehend.** Die kompakten Modelle liegen knapp doppelt so gut, unser Standardmodell Mistral Medium aber gut dreimal schlechter. Dass es beim CO₂ trotzdem den besten Wert erzielt, verdankt sich dem französischen Netz — nicht sparsamerer Technik. Zweitens: **Die GPT-4o-Zahl ist selbst nur geschätzt.** OpenAI veröffentlicht nichts; sie wurde aus Antwortzeiten, GPU-Datenblättern und einer statistisch erschlossenen Hardware-Annahme abgeleitet. Unsere Zahlen kommen von einem Zähler. Die Unsicherheit sitzt fast vollständig auf der anderen Seite.

## Was die ganze Plattform verbraucht

Die **[Transparenz-Seite](https://gruenerator.eu/transparenz)** zeigt die Summe über alle Nutzer:innen: Energie und CO₂ des gesamten Grünerators, aufgeschlüsselt nach Anbieter, Bereich und Funktion, dazu der Tagesverlauf. Das ist die einzige Stelle, an der wir eine absolute Verbrauchszahl nennen — hier beschreibt sie unsere eigenen Entscheidungen und nicht das Verhalten einzelner Menschen.

Drei Entscheidungen dahinter sind erklärungsbedürftig, weil sie die Zahlen kleiner oder unschärfer machen, als sie sein könnten.

**Es ist eine Spanne, keine Zahl.** Wo ein Modell vermessen ist und das Land des Anbieters feststeht, fallen alle Enden zusammen. Wo nicht, zeigt die Skala beide Enden der gemessenen Klammer und die angezeigte Zahl sitzt dazwischen. Ihre Breite ist damit ein direktes Maß dafür, wie viel wir noch nicht wissen — und sie wird schmaler, sobald eine Lane vermessen wird, nicht durch besseres Formulieren.

**Tage mit sehr wenigen Aktiven fallen ganz heraus.** Unterschreitet ein Tag fünf verschiedene Nutzer:innen, wird er nicht nur aus dem Verlauf ausgeblendet, sondern auch aus allen Summen entfernt. Nur auszublenden würde nichts nützen: Wer zwei Zeiträume abfragt, die sich um einen Tag unterscheiden, könnte ihn durch Subtraktion zurückrechnen. Die Zahl der zurückgehaltenen Tage steht mit dabei, damit eine Lücke als Lücke erkennbar ist und nicht als Ruhetag.

**Die Konstanten stehen dabei.** Zu jedem Anbieter veröffentlichen wir den angesetzten Netzmix und den PUE-Wert neben seinem Anteil. Ein Fußabdruck, den niemand nachrechnen kann, ist eine Behauptung und keine Offenlegung.

**Transkription, Websuche und Sprachausgabe stehen dabei, tragen aber null.** Alle drei erscheinen als eigene Abschnitte mit ihren Modellen — sonst sähe die Aufstellung so aus, als hätten wir sie vergessen. Ein Fußabdruck ist ihnen trotzdem nicht zugeordnet: Für Spracherkennung meldet kein Anbieter Verbrauch, und wir speichern keine Audiodauer, mit der er skalieren würde; bei der Websuche steckt die Energie im Index des Suchanbieters, nicht bei uns; bei der Sprachausgabe erfassen wir zwar die Dauer, es fehlt aber der Verbrauchswert je Sekunde. Als Lücke ausgewiesen ist ehrlicher, als sie stillschweigend als Null mitzuzählen.

Was oben unter „Was die Zahl _nicht_ enthält" steht, gilt hier unverändert — auch die Plattformzahl ist eine Untergrenze.

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
- [Uptime Institute Global Data Center Survey 2025](https://datacenter.uptimeinstitute.com/rs/711-RIA-145/images/2025.Annual.Survey.Report.pdf) — PUE-Durchschnitt: europäische Region 1,50 (n = 134), weltweit 1,54 (n = 681)
- [Energieeffizienzgesetz (EnEfG) § 11](https://www.gesetze-im-internet.de/enefg/__11.html) — gesetzliche PUE-Obergrenzen für Rechenzentren in Deutschland
- [Hetzner: EMAS-Umwelterklärung 2025](https://cdn.hetzner.com/assets/Uploads/downloads/Umwelterklaerung.pdf) — PUE-Kennzahl und Geltungsbereich
- [GHG Protocol Scope 2 Guidance](https://ghgprotocol.org/scope-2-guidance) — standortbasiert vs. marktbasiert
- Unsere eigene Messreihe ist im Code dokumentiert und wiederholbar: `apps/api/services/usage/energyFootprint.ts` und `apps/api/scripts/probeGreenptImpact.ts`

:::info[Ehrlich bleiben]
Die genannten Zahlen sind Anbieterangaben (Stand Juli 2026). Und auch grüne KI verbraucht Ressourcen — Nachhaltigkeit heißt beim Grünerator nicht „kostenlos für die Umwelt", sondern: bewusst kleine Modelle, bewusst grüne Anbieter, bewusst europäische Infrastruktur.
:::

Warum die Anbieter außerdem alle in Europa sitzen, liest du unter [Grünerator Pro-EU](./gruenerator-pro-eu.md).
