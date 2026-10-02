---
sidebar_position: 3
description: 'Warum politische Kommunikation nicht über US-Server laufen sollte und welche europäische Infrastruktur den Grünerator trägt.'
---

# Grünerator Pro-EU

## Politische Kommunikation gehört in europäische Hände

Wenn Parteien, Abgeordnete und Ehrenamtliche KI-Werkzeuge nutzen, fließen politische Inhalte durch fremde Infrastruktur – Kampagnentexte, Pressemitteilungen, interne Strategien. Bei den meisten KI-Tools landen diese Daten auf US-Servern, verarbeitet von Unternehmen, die weder europäischem Recht noch demokratischer Kontrolle unterliegen.

Der Grünerator ist die souveräne Alternative: **100% europäische Infrastruktur, 100% europäische Anbieter, 100% europäische Ausgaben.** Deine politische Arbeit verlässt niemals die EU – egal ob Text, Bild, Sprache oder Suche.

## Unsere europäischen Partner

{/* Modell-Stand aus dem Code: apps/api/routes/chat/agents/providers.ts,
apps/api/services/ai/providers.ts, apps/api/services/ai/gemmaHosts.ts, apps/api/services/flux/,
apps/api/services/transcription/providerPolicy.ts,
apps/api/services/voice/ttsService.ts,
apps/api/services/providers/providerSelector.ts,
apps/api/services/ai/intermediateLanes.ts, apps/api/services/search/ */}

- **Mistral AI** (Frankreich) — Standardmodell Mistral Medium 3.5 (`mistral-medium-2604`), Pixtral Large als im Chat wählbares Modell, Suche und Notebooks mit `mistral-embed`, Transkription mit Voxtral
- **KugelAudio** (Berlin, Deutschland) — Sprachausgabe mit `kugel-3`: das Vorlesen von Antworten und die Stimme im Sprachdialog, ausschließlich über den EU-Endpunkt `api.eu.kugelaudio.com`. Seit September 2026 anstelle von Mistral Speech. Keine dauerhafte Speicherung der Inhalte, kein Training; jede erzeugte Audiodatei trägt ein Wasserzeichen nach Art. 50 KI-VO
- **Black Forest Labs** (Freiburg, Deutschland) — Bilderzeugung und -bearbeitung mit FLUX 3 (`flux-3-image`, seit Oktober 2026 anstelle von FLUX 2 Pro/Max) und FLUX 2 Klein, ausschließlich über den EU-Endpunkt `api.eu.bfl.ai`; die Websuche des Modells (`grounding`) ist abgeschaltet
- **Cortecs** (Vermittler, EU) — vermittelt Gemma 4 (`gemma-4-31b-it`) an **Infercom SCS** (Luxemburg, Verarbeitung in Deutschland). Seit August 2026 das Modell, das die meisten Chat-Antworten und fertigen Texte schreibt sowie lange Dokumente zusammenfasst. Cortecs bekommt bei jeder Anfrage die Weisung, nur in der EU ansässige Anbieter mit Zero Data Retention einzusetzen; welcher Anbieter tatsächlich gerechnet hat, steht in jeder Antwort und wird protokolliert
- **GreenPT** (Utrecht, Niederlande; Verarbeitung in Paris, Frankreich) — Anfragen einordnen und Werkzeug-Planung mit Mistral Small (Ausweichwege über Cortecs, Mistral und Melious; die Reihenfolge hängt von der Aufgabe ab), erzeugte Dateien (PDFs, Präsentationen, Tabellen, Dokumente) mit Gemma 4, das Sortieren von Suchergebnissen (Reranking) sowie der Ausweichweg für die Transkription, 100 % erneuerbare Energie
- **Melious** (Saarbrücken, Deutschland; Gemma 4 läuft auf einem Melious-Knoten in Finnland) — Ausweichweg für Gemma 4 (Kreativtexte und Werkzeug-Planung), Bilderzeugung mit FLUX 2 Klein, unter anderem für „KI-Bild erstellen“ im Sharepic-Editor, sowie Gemma 4 für die experimentellen Boxen im Bild-Editor (Bildelemente erkennen, Layout planen)
- **DeepL** (Köln) — maschinelle Übersetzung von Texten und Dokumenten im Übersetzer und im Chat-Werkzeug `text_uebersetzen`; Dokumente werden nach dem Abruf bei DeepL gelöscht
- **verdigado eG** (Deutschland / Finnland) — Infrastruktur und Datenbank. Die selbst gehostete Modell-Instanz bediente bis zum 29.08.2026 auch Sprachmodell-Anfragen; sie tut es nicht mehr (siehe [Nachhaltigkeit](./nachhaltigkeit.md))
- **Linkup** (Paris) — Websuche mit Quellenangaben im Chat und in der Recherche
- **SearXNG** (selbstgehostet, Deutschland) — Suche
- **Hetzner** (Deutschland) — Hosting, an deutschen Standorten mit 100 % Wasserkraft

:::info[Digitale Souveränität ist kein Luxus]
Wer europäische Werte vertritt, sollte europäische Werkzeuge nutzen. Der Grünerator zeigt, dass das ohne Qualitätsverlust möglich ist.
:::

Wie nachhaltig diese Partner arbeiten, zeigt [Wie nachhaltig ist der Grünerator?](./nachhaltigkeit.md). Details zu allen Anbietern findest du in unserer [Datenschutzerklärung](https://gruenerator.de/datenschutz).
