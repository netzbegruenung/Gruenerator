import { type ProtokollTyp } from '@gruenerator/contracts';
import { generateText } from 'ai';

import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../ai/providers.js';

const log = createLogger('protokoll');

interface ProtokollRequest {
  inputText: string;
  protokollTyp: ProtokollTyp;
}

/**
 * How much transcript the todo extraction sees.
 *
 * The cut is real and has to stay for now — but it used to be silent, which is
 * the dangerous part: a two-hour meeting produced a task list covering its
 * first fifteen minutes and looked exactly like a complete one. Callers now get
 * the numbers back so the UI can say what was left out.
 */
const TODO_INPUT_LIMIT = 8000;

export interface TodoListResult {
  content: string;
  truncated: boolean;
  coveredChars: number;
  totalChars: number;
}

/**
 * Speaker names are spoken when people greet each other and sign off, so the
 * opening and closing stretches carry nearly all the evidence. Sampling both
 * ends keeps a long transcript inside the context window without losing the
 * part that actually answers the question.
 */
const SPEAKER_SAMPLE_CHARS = 6000;

function sampleForSpeakerIdentification(text: string): string {
  if (text.length <= SPEAKER_SAMPLE_CHARS * 2) return text;
  return `${text.slice(0, SPEAKER_SAMPLE_CHARS)}\n\n[… gekürzt …]\n\n${text.slice(-SPEAKER_SAMPLE_CHARS)}`;
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

// Speaker identification runs on long, diarized transcripts — Mistral Medium (long
// context) handles the full text without truncation. Falls back to the generic
// protokoll model only if Mistral is unconfigured (diarization itself requires it).
function getSpeakerModel() {
  if (isProviderConfigured('mistral')) return getModel('mistral');
  return getProtokollModel();
}

export async function identifySpeakers(diarizedText: string): Promise<Record<string, string>> {
  const speakerIds = [...new Set(diarizedText.match(/\[speaker_\d+\]/g) || [])].map((s) =>
    s.slice(1, -1)
  );
  if (speakerIds.length === 0) return {};

  log.debug('[Protokoll] Identifying speakers:', speakerIds);

  const result = await generateText({
    model: getSpeakerModel(),
    system: `Du analysierst Transkriptionen mit Sprecher*innen-Markierungen und identifizierst die Namen der Sprecher*innen anhand von Kontexthinweisen im Text (z.B. "Herr X", "Frau Y", direkte Ansprachen, Namensnennung).

Antworte NUR mit einem JSON-Objekt, das Speaker-IDs auf Namen abbildet. Wenn du einen Namen nicht sicher zuordnen kannst, verwende eine beschreibende Rolle (z.B. "Moderator*in", "Interviewer*in").

Beispiel-Antwort:
{"speaker_0": "Markus Lanz", "speaker_1": "Eva Dunz", "speaker_2": "Roderich Kiesewetter"}`,
    prompt: `Identifiziere die Sprecher*innen in dieser Transkription:\n\n${sampleForSpeakerIdentification(diarizedText)}\n\nSpeaker-IDs: ${speakerIds.join(', ')}\n\nAntwort als JSON:`,
    temperature: 0.1,
    maxOutputTokens: 500,
  });

  // A failure here degrades to `Sprecher*in N` labels rather than breaking the
  // transcript, so it stays non-fatal — but it is logged loudly enough to tell
  // "no names found" apart from "the model returned something unusable".
  const jsonMatch = result.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    log.warn(
      '[Protokoll] Speaker identification returned no JSON object:',
      result.text.slice(0, 200)
    );
    return {};
  }
  try {
    const mapping = JSON.parse(jsonMatch[0]) as Record<string, string>;
    log.debug('[Protokoll] Speaker mapping:', mapping);
    return mapping;
  } catch {
    log.warn('[Protokoll] Failed to parse speaker mapping:', result.text.slice(0, 200));
    return {};
  }
}

export async function extractTodoList(inputText: string, title?: string): Promise<TodoListResult> {
  const covered = inputText.slice(0, TODO_INPUT_LIMIT);
  const truncated = inputText.length > TODO_INPUT_LIMIT;
  log.debug('[Protokoll] Extracting todo list', `(${inputText.length} chars input)`);
  if (truncated) {
    log.warn(
      `[Protokoll] Todo extraction input cut from ${inputText.length} to ${TODO_INPUT_LIMIT} chars`
    );
  }

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
    prompt: `Extrahiere alle Aufgaben und Action Items aus folgendem Text:\n\n<text>\n${covered}\n</text>\n\n${title ? `Titel: ${title}` : ''}`,
    temperature: 0.2,
  });

  log.debug('[Protokoll] Todo list extracted', result.usage?.totalTokens, 'tokens');
  return {
    content: result.text,
    truncated,
    coveredChars: covered.length,
    totalChars: inputText.length,
  };
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
  });

  log.debug('[Protokoll] Generated', result.usage?.totalTokens, 'tokens');
  return result.text;
}
