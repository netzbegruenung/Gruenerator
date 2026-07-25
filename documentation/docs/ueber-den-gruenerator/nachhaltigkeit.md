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

:::info[Ehrlich bleiben]
Die genannten Zahlen sind Anbieterangaben (Stand Juli 2026). Und auch grüne KI verbraucht Ressourcen — Nachhaltigkeit heißt beim Grünerator nicht „kostenlos für die Umwelt", sondern: bewusst kleine Modelle, bewusst grüne Anbieter, bewusst europäische Infrastruktur.
:::

Warum die Anbieter außerdem alle in Europa sitzen, liest du unter [Grünerator Pro-EU](./gruenerator-pro-eu.md).
