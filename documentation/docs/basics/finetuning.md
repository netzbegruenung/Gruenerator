---
sidebar_position: 11
description: 'Wie ein allgemeines Sprachmodell grüne Sprache lernt — Rhetorik, Genderstern, der Aufbau einer Pressemitteilung.'
---

# Fine-Tuning: Ein eigenes Sprachmodell trainieren

## Was ist Fine-Tuning?

Stellt euch vor, ihr habt eine*n neue*n Mitarbeiter\*in eingestellt. Diese Person ist klug, spricht fließend Deutsch und kann gut schreiben — aber sie kennt weder den Kommunikationsstil der Grünen, noch weiß sie, wie eine Pressemitteilung der Partei aufgebaut ist oder welchen Ton ein Instagram-Post von Bündnis 90/Die Grünen treffen sollte.

Genau so verhält es sich mit einem allgemeinen Sprachmodell wie GPT-OSS. Es kann hervorragend Texte verfassen, kennt aber nicht die spezifischen Muster grüner Kommunikation: die Rhetorik, den Genderstern, die Balance zwischen Dringlichkeit und Pragmatismus, die typische Struktur einer Presseaussendung.

**Fine-Tuning** ist der Prozess, in dem wir diesem Modell beibringen, wie die Grüne Partei kommuniziert — indem wir es auf tausenden echten Parteidokumenten trainieren: Pressemitteilungen, Beschlüsse, Social-Media-Posts und Grundsatzprogramme.

## Wie funktioniert LoRA?

Klassisches Fine-Tuning würde alle 20 Milliarden Parameter eines Modells neu trainieren. Das ist teuer, langsam und riskant — das Modell könnte dabei seine allgemeinen Fähigkeiten „vergessen".

**LoRA** (Low-Rank Adaptation) geht einen anderen Weg: Es friert alle originalen Gewichte ein und fügt kleine, trainierbare Matrizen hinzu — weniger als 0,1 % der Parameter. Das Ergebnis ist ein leichtgewichtiger **Adapter**, der das Verhalten des Modells in Richtung Partei-Kommunikation verschiebt, ohne dass es verlernt, was es bereits kann.

Man kann sich das wie eine Brille vorstellen: Das Modell selbst bleibt unverändert, aber durch den Adapter „sieht" es die Welt durch eine grüne Perspektive.

### Vorteile von LoRA

- **Schnell**: Wenige Minuten statt Tagen
- **Günstig**: ~2 € pro Trainingsrun
- **Sicher**: Das Basismodell wird nicht verändert
- **Flexibel**: Adapter können bei jeder Anfrage gewechselt werden

## Unser Ansatz: Getrennte Modelle für Deutschland und Österreich

Der Grünerator bedient zwei unterschiedliche Grüne Parteien:

- **Bündnis 90/Die Grünen** (Deutschland)
- **Die Grünen – Die Grüne Alternative** (Österreich)

Das sind nicht regionale Varianten desselben Stils — es sind verschiedene Organisationen mit unterschiedlichen Namen, Strukturen und Positionen. Deshalb trainieren wir **separate LoRA-Adapter** für jedes Land, die auf demselben Basismodell laufen.

Die Sprache der Nutzer\*in (Deutsch/Deutschland oder Deutsch/Österreich) bestimmt automatisch, welcher Adapter verwendet wird — ohne Mehrkosten.

## Welche Daten verwenden wir?

### Deutschland

| Quelle             | Inhalt                                  | Beispiele |
| ------------------ | --------------------------------------- | --------- |
| Landesverbände     | Pressemitteilungen, Beschlüsse, Anträge | ~300      |
| Bundestagsfraktion | Fachtexte, Positionen                   | ~100      |
| Social Media       | Facebook- und Instagram-Posts           | ~200      |
| gruene.de          | Website-Inhalte                         | ~100      |
| Grundsatzprogramm  | Programmatische Texte                   | ~60       |

### Österreich

| Quelle           | Inhalt                     | Beispiele |
| ---------------- | -------------------------- | --------- |
| Partei-Programme | Grundsatzprogramm          | ~60       |
| gruene.at        | News, Themen, Organisation | ~160      |

### Was verwenden wir bewusst nicht?

- **Heinrich-Böll-Stiftung**: Akademischer, analytischer Ton — nicht die Stimme der Partei
- **Kommunalwiki**: Neutrale Enzyklopädie-Artikel — nicht politische Kommunikation

## Die Trainings-Pipeline

```
Schritt 1: Dokumente exportieren     → Rohdaten aus der Qdrant-Datenbank
Schritt 2: Trainingsdaten erstellen  → Qualitätsfilter, Balancierung, Format
Schritt 3: Modell trainieren         → LoRA Fine-Tuning bei Together AI
```

### Schritt 1: Export

Die Dokumente liegen als Vektoren in unserer Qdrant-Datenbank. Das Export-Skript setzt sie aus Chunks wieder zu vollständigen Texten zusammen und speichert Metadaten wie Titel, Inhaltstyp, Erscheinungsdatum und Landesverband.

### Schritt 2: Transformation

Rohdokumente werden in Chat-Format umgewandelt — jedes Trainingsbeispiel besteht aus:

1. **System-Prompt**: Definiert die Rolle als Kommunikationsexpert\*in der Grünen
2. **User-Prompt**: Eine Aufgabe wie „Schreibe eine Pressemitteilung zum Thema: Klimaschutzgesetz"
3. **Antwort**: Der tatsächliche Dokumenttext

Dabei werden mehrere Filter angewendet:

- **Qualität**: Zu kurze Texte und Duplikate werden entfernt
- **Aktualität**: Bevorzugt werden neuere Dokumente (ab 2022)
- **Balance**: Pro Sammlung und Inhaltstyp werden maximal 100 Beispiele verwendet, damit keine Quelle dominiert

### Schritt 3: Training

Die aufbereiteten Daten werden bei Together AI hochgeladen und ein LoRA-Training gestartet. Das Training dauert etwa 10-15 Minuten und kostet ~2 €.

## Erste Ergebnisse

Das erste deutsche Modell (`gruenerator-de-v1`) wurde am 5. April 2026 trainiert.

### Trainingsdetails

| Parameter          | Wert                         |
| ------------------ | ---------------------------- |
| Basismodell        | GPT-OSS 20B                  |
| Methode            | LoRA (Rank 64, Alpha 16)     |
| Trainingsbeispiele | 750 (+ 84 Validation)        |
| Epochen            | 1                            |
| Trainingsdauer     | ~12 Minuten                  |
| Kosten             | 1,74 €                       |
| Eval Loss          | 5,10 → 3,84 (stetig fallend) |

### Beispiel-Ausgaben

**Pressemitteilung** (Thema: Erneuerbare Energien in Brandenburg):

> **Brandenburg beschleunigt den Ausbau erneuerbarer Energien – Weg zu einer klimaneutralen Zukunft**
> _Brandenburg, 4. April 2026 –_ Das Land Brandenburg hat heute einen ambitionierten Plan vorgestellt, der den Ausbau von Wind- und Solarenergie bis 2030 auf ein neues Niveau heben soll.

**Instagram-Post** (Thema: Klimaschutz im Alltag):

> 🌍 **Klimaschutz im Alltag – Jeder Schritt zählt!** 🌱
> 💡 Kleine Taten, große Wirkung
> 🚲 Kurzstrecken per Fahrrad statt Auto – mehr Bewegung, weniger CO₂.
> ♻️ Abfalltrennung: Plastik, Papier, Bio – alles trennt sich leichter, wenn wir es wollen.

## Modell verwenden & herunterladen

Das trainierte Modell ist privat auf Together AI gespeichert und kann direkt per API verwendet oder als Datei heruntergeladen werden.

### Modellname (Together AI API)

```
moritzius007_971c/gpt-oss-20b-gruenerator-de-v1-40c19966
```

### Download

Zwei Varianten stehen zum Download bereit:

| Variante    | Größe   | Beschreibung                                                       |
| ----------- | ------- | ------------------------------------------------------------------ |
| **Adapter** | ~115 MB | Nur die LoRA-Gewichte. Kann auf das Basismodell aufgesetzt werden. |
| **Merged**  | ~20 GB  | Vollständiges Modell mit eingebackenem Adapter. Direkt einsetzbar. |

Download über die Together AI API (erfordert `TOGETHER_API_KEY`):

```bash
cd apps/api

# Adapter herunterladen (empfohlen — klein, flexibel)
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py \
  --download ft-8f0086c8-1811 --download-type adapter

# Vollständiges Modell herunterladen
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py \
  --download ft-8f0086c8-1811 --download-type merged
```

Die Dateien werden als ZSTD-komprimierte Archive (`.tar.zst`) gespeichert und können mit `tar --zstd -xf dateiname.tar.zst` entpackt werden.

### Selbst hosten

Das heruntergeladene Modell kann lokal oder auf eigener Infrastruktur betrieben werden — zum Beispiel über LiteLLM, vLLM oder llama.cpp. Details dazu stehen im [FINETUNING-GUIDE](https://github.com/netzbegruenung/gruenerator/blob/master/apps/api/scripts/FINETUNING-GUIDE.md).

## Nächste Schritte

- **Österreich-Adapter**: Separates Modell für Die Grüne Alternative, trainiert auf österreichischen Parteidokumenten
- **Spezialist\*innen-Adapter**: Fokussierte Modelle für einzelne Inhaltstypen (Presse, Social Media, Beschlüsse), falls die Qualität es erfordert
- **Integration**: Anbindung an den Grünerator über LiteLLM, automatische Adapter-Auswahl nach Sprache und Inhaltstyp

## Kosten-Überblick

| Was                                 | Kosten                         |
| ----------------------------------- | ------------------------------ |
| Ein Länder-Adapter (Training)       | ~2 €                           |
| Beide Länder                        | ~4 €                           |
| Spezialist\*innen-Adapter (Phase 2) | ~2 € pro Stück                 |
| Inferenz (Nutzung)                  | Gleicher Preis wie Basismodell |

Fine-Tuning mit LoRA ist eine der kosteneffizientesten Methoden, um ein Sprachmodell an die eigenen Bedürfnisse anzupassen — und bei ~2 € pro Adapter ist das Experimentieren praktisch risikofrei.
