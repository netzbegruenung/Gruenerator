import { generateText } from 'ai';

import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../ai/providers.js';

const log = createLogger('protokoll');

type ProtokollTyp = 'Sitzungsprotokoll' | 'Ergebnisprotokoll' | 'Verlaufsprotokoll';

interface ProtokollRequest {
  inputText: string;
  protokollTyp: ProtokollTyp;
}

const SYSTEM_PROMPT = `Du bist ein erfahrener Protokollführer für politische Gremien, Vereine und Organisationen. Du erstellst präzise, gut strukturierte Sitzungsprotokolle aus Transkriptionen.

**Protokollarten:**

1. **Sitzungsprotokoll**: Ausführliche Dokumentation mit Diskussionsverlauf, Wortbeiträgen und Beschlüssen
2. **Ergebnisprotokoll**: Fokus auf Beschlüsse, Ergebnisse und Aufgaben — keine Diskussionsdetails
3. **Verlaufsprotokoll**: Chronologische Dokumentation aller Beiträge in der Reihenfolge ihres Auftretens

**Struktur:**
- Anwesende/Teilnehmende (falls erkennbar)
- Tagesordnungspunkte (TOPs)
- Für jeden TOP: Diskussion/Verlauf und Beschlüsse
- Aufgaben und Verantwortlichkeiten
- Nächste Schritte/Termine

**Formatierung:**
- Klare Überschriften und Nummerierung (Markdown)
- Beschlüsse mit **Beschluss:** hervorheben
- Aufgaben mit Verantwortlichen und Fristen
- Sachlich und neutral formulieren`;

function getProtokollModel() {
  if (isProviderConfigured('litellm')) return getModel('litellm');
  if (isProviderConfigured('mistral')) return getModel('mistral');
  throw new Error('Kein AI-Provider konfiguriert');
}

export async function identifySpeakers(diarizedText: string): Promise<Record<string, string>> {
  const speakerIds = [...new Set(diarizedText.match(/\[speaker_\d+\]/g) || [])].map((s) =>
    s.slice(1, -1)
  );
  if (speakerIds.length === 0) return {};

  log.debug('[Protokoll] Identifying speakers:', speakerIds);

  const result = await generateText({
    model: getProtokollModel(),
    system: `Du analysierst Transkriptionen mit Sprecher*innen-Markierungen und identifizierst die Namen der Sprecher*innen anhand von Kontexthinweisen im Text (z.B. "Herr X", "Frau Y", direkte Ansprachen, Namensnennung).

Antworte NUR mit einem JSON-Objekt, das Speaker-IDs auf Namen abbildet. Wenn du einen Namen nicht sicher zuordnen kannst, verwende eine beschreibende Rolle (z.B. "Moderator*in", "Interviewer*in").

Beispiel-Antwort:
{"speaker_0": "Markus Lanz", "speaker_1": "Eva Dunz", "speaker_2": "Roderich Kiesewetter"}`,
    prompt: `Identifiziere die Sprecher*innen in dieser Transkription:\n\n${diarizedText.slice(0, 6000)}\n\nSpeaker-IDs: ${speakerIds.join(', ')}\n\nAntwort als JSON:`,
    temperature: 0.1,
    maxOutputTokens: 500,
  });

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const mapping = JSON.parse(jsonMatch[0]) as Record<string, string>;
    log.debug('[Protokoll] Speaker mapping:', mapping);
    return mapping;
  } catch {
    log.warn('[Protokoll] Failed to parse speaker mapping:', result.text);
    return {};
  }
}

export async function extractTodoList(inputText: string, title?: string): Promise<string> {
  log.debug('[Protokoll] Extracting todo list', `(${inputText.length} chars input)`);

  const result = await generateText({
    model: getProtokollModel(),
    system: `Du extrahierst Aufgaben, Action Items, Beschlüsse und To-Dos aus Transkriptionen und Protokollen.

Antworte NUR mit HTML im folgenden Format — keine Erklärung, kein Markdown:

<h1>Titel</h1>
<h2>Kategorie (optional)</h2>
<ul>
<li><input type="checkbox">Aufgabe 1</li>
<li><input type="checkbox">Aufgabe 2</li>
</ul>

Regeln:
- Extrahiere ALLE konkreten Aufgaben, Beschlüsse und Handlungsaufforderungen
- Formuliere jede Aufgabe als klaren, actionable Satz
- Gruppiere nach Thema/Kategorie wenn sinnvoll
- Füge Verantwortliche in Klammern hinzu wenn erkennbar, z.B. "Budget prüfen (Herr Müller)"
- Keine bereits erledigten Aufgaben als checked markieren — alle sind offen`,
    prompt: `Extrahiere alle Aufgaben und Action Items aus folgendem Text:\n\n<text>\n${inputText.slice(0, 8000)}\n</text>\n\n${title ? `Titel: ${title}` : ''}`,
    temperature: 0.2,
    maxOutputTokens: 4000,
  });

  log.debug('[Protokoll] Todo list extracted', result.usage?.totalTokens, 'tokens');
  return result.text;
}

export async function generateProtokoll({
  inputText,
  protokollTyp,
}: ProtokollRequest): Promise<string> {
  log.debug('[Protokoll] Generating', protokollTyp, `(${inputText.length} chars input)`);

  const result = await generateText({
    model: getProtokollModel(),
    system: SYSTEM_PROMPT,
    prompt: `Erstelle ein ${protokollTyp} aus folgender Transkription:\n\n<transkription>\n${inputText}\n</transkription>\n\nBitte erstelle ein professionelles, gut strukturiertes Protokoll.`,
    temperature: 0.3,
    maxOutputTokens: 8000,
  });

  log.debug('[Protokoll] Generated', result.usage?.totalTokens, 'tokens');
  return result.text;
}
