/**
 * Führt die Nachschritte eines Pipeline-Agenten aus.
 *
 * Die Bauform: Schritt 1 ist der normale Antwortpfad und ist bereits gestromt,
 * wenn dieses Modul dran ist. Alles Weitere hängt hier an denselben
 * Nachrichtentext an — dieselbe Naht, mit der `deepResearchTurn.ts` seinen
 * Sonderweg neben dem Antwortpfad hält, statt ihn mit Verzweigungen zu
 * durchsetzen.
 *
 * ── Warum die Schritte eigene Kontexte haben ──
 *
 * Bis zum 13.08.2026 schrieb der Einfache-Sprache-Agent Übertragung,
 * Zuordnungstabelle und Selbstkontrolle in EINE Generierung. Der erste echte
 * Lauf zeigte dreifach, was das kostet:
 *
 * 1. **Die Selbstkontrolle war wertlos.** Sie meldete „vollständig", während
 *    ein Ortsname fehlte. Wer seinen eigenen Text im eigenen Kontext bewertet,
 *    erinnert sich an seine Absicht statt seine Auslassung zu suchen.
 * 2. **Die Kategorien verschwammen.** Der Systemprompt trug den Rezept-Katalog
 *    mit, und das Modell zog die Nachbarrolle „Rückübersetzung" in die eigene
 *    Ausgabe.
 * 3. **Die Ausgabe zerfiel.** Nach 10022 Zeichen schlug der Degenerations-Guard
 *    zu — Auslöser war die lange Tabelle am Ende einer langen Generierung. Sie
 *    wohnt jetzt im Prüfschritt, wo sie inhaltlich hingehört: sie IST eine
 *    Prüfaussage.
 *
 * ── Was hier NICHT passiert ──
 *
 * Die Kette schreibt die Fassung nicht um. Findet die Prüfung einen
 * KRITISCH-Befund, steht das im Bericht und der Mensch entscheidet. Bei einem
 * Text, der als barrierefreie Fassung veröffentlicht wird, ist ein sichtbarer
 * Mangel besser als eine stille Ausbesserung.
 *
 * Fail-open in jedem Schritt, aber nie stumm: fällt ein Teil aus, bekommt der
 * Nutzer seine Fassung trotzdem — und liest, dass sie ungeprüft ist.
 */

import { intermediateLane } from '../../../agents/langgraph/ChatGraph/llmConfig.js';
import { createLogger } from '../../../utils/logger.js';

import { INLINE_MATERIAL_MIN_CHARS } from './streamContext.js';

import type { SSEWriter } from './sseHelpers.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { MaterialState, PipelineAgent, PipelineStep } from '../agents/pipelines/index.js';

/** @see services/ai/intermediateLanes.ts */
const LANE = intermediateLane('pruefung');

const log = createLogger('AgentPipeline');

/**
 * Findet den Ausgangstext, den dieser Turn verarbeitet.
 *
 * Der Router kennt vier Wege, auf denen Material hereinkommt, und die Pipeline
 * braucht ALLE: fehlt der Ausgangstext, prüft sie nichts. Eingefügtes Material
 * hebt `streamContext` in die Nutzernachricht, `@datei`/`@text` landen im
 * Anhang-Kontext, `@dokument` in `documentMentionContext`.
 *
 * Warum der LÄNGSTE gewinnt und nicht der erste: bei `@dokument` ist die
 * Nutzernachricht nur die Anweisung („Übertrage @mein-antrag in Einfache
 * Sprache"). Die ist nicht leer — eine Reihenfolge-Regel mit `||` würde sie
 * also nehmen und gegen einen Einzeiler prüfen, was schlimmer ist als gar nicht
 * zu prüfen: die Abdeckungsliste meldete dann Vollständigkeit für einen Satz.
 * Material ist lang, eine Anweisung kurz — die Länge ist hier das ehrlichere
 * Merkmal als die Herkunft.
 *
 * `currentDocument` steht bewusst NUR als letzter Ausweg drin und nimmt am
 * Längenvergleich nicht teil: im Dokument-Editor ist das offene Dokument oft
 * länger als der eingefügte Absatz und hat mit ihm nichts zu tun. Ein falsches
 * Original ist teurer als keins — es erzeugt erfundene KRITISCH-Befunde.
 *
 * Der Rückgabewert wird an BEIDEN Enden der Kette benutzt: er wird Schritt 1 in
 * den Systemprompt genagelt und ist zugleich das Mass der Prüfung. Vorher
 * entschied Schritt 1 selbst, was aus dem Thread-Kontext gemeint war — und dort
 * liegt bei jedem Folge-Turn der Volltext aller früheren Anhänge.
 *
 * ── Der Turn, der gar kein eigenes Material hat ──
 *
 * Ein Nutzer, der die Fassung beanstandet („die Freigabe ist falsch, hier sind
 * sechs Fehler"), schickt eine Anweisung und sonst nichts. Der Längenvergleich
 * hatte dann nur noch einen Kandidaten und nahm ihn: am 13.08.2026 wurde die
 * Kritik selbst zum Original, und der Prüfbericht führte die Beanstandungen als
 * „Kerninhalte des Originals", meldete sechs davon als fehlend und lehnte eine
 * Fassung ab, die er nie gegen ihren Artikel gehalten hatte.
 *
 * Der Artikel WAR da, nur nicht mehr in den drei Kanälen: ein grosser Anhang
 * wandert nach dem ersten Turn nach Qdrant, und `formatThreadAttachmentsContext`
 * lässt ihn dann aus dem Volltext-Kontext heraus (`!a.documentId`), weil er per
 * RAG zurückkommt. Für ein Gespräch ist das richtig; für eine Prüfung, die den
 * ganzen Text braucht, ist es tödlich. Deshalb liest dieser Auflöser die
 * Anhang-Zeilen des Threads direkt und nimmt ihren gespeicherten Volltext.
 *
 * ── Der kurze Text, der trotzdem Material ist ──
 *
 * Die Längengrenze allein irrt in die andere Richtung: am 14.08.2026 lag ein
 * frisch eingefügter Text von 1339 Zeichen unter ihr, wurde als Anweisung
 * gewertet und vom Artikel des vorigen Turns verdrängt. Die Fassung entstand
 * trotzdem aus ihm - er stand ja in der Nachricht -, die Prüfung mass gegen den
 * alten Artikel und meldete die richtige Fassung als vollständige Halluzination.
 *
 * `promptIsPastedText` ist dafür das ehrlichere Merkmal als die Länge: eine
 * Beanstandung wird getippt, ein Ausgangstext eingefügt. Trifft es zu, ist die
 * Nachricht Material, wie kurz sie auch sei.
 */
export function resolveOriginalText(
  state: MaterialState,
  lastUserText: string,
  promptIsPastedText = false
): string {
  const material = [state.attachmentContext ?? '', state.documentMentionContext ?? '']
    .map((c) => c.trim())
    .filter(Boolean);
  const instruction = lastUserText.trim();

  // Bringt dieser Turn kein eigenes Material mit, revidiert er einen früheren —
  // dann ist die Nachricht die Anweisung, nicht der Ausgangstext. Die Grenze ist
  // dieselbe, an der `inlineMaterialAttachment` Material von Anweisung trennt;
  // zwei Zahlen für dieselbe Frage würden auseinanderlaufen.
  if (
    material.length === 0 &&
    !promptIsPastedText &&
    instruction.length < INLINE_MATERIAL_MIN_CHARS
  ) {
    const carried = carriedOriginalText(state);
    if (carried) {
      log.info(
        `Kein eigenes Material in diesem Turn — Ausgangstext aus dem Thread übernommen ` +
          `(${carried.length} Zeichen, Anweisung ${instruction.length})`
      );
      return carried;
    }
  }

  const longest = [instruction, ...material].reduce((a, b) => (b.length > a.length ? b : a), '');
  return longest || (state.currentDocument?.markdown ?? '').trim();
}

/**
 * Der Volltext des zuletzt hochgeladenen oder eingefügten Dokuments dieses
 * Threads, oder ''.
 *
 * Der JÜNGSTE gewinnt und nicht der längste: über mehrere Turns hinweg ist die
 * Frage „welches Dokument ist gemeint" eine der Reihenfolge, nicht des Umfangs.
 * Wer einen zweiten Text nachreicht, meint ihn.
 *
 * `documentId` wird bewusst NICHT gefiltert — anders als im Antwort-Kontext ist
 * hier gerade der eingebettete grosse Text der gesuchte. Bilder scheiden aus:
 * ihr `extractedText` ist eine Bildbeschreibung, kein Ausgangstext.
 *
 * Sortiert wird nach `createdAt` und nicht auf die Reihenfolge der Liste
 * vertraut. Die stimmt heute (`getThreadAttachments` fragt DESC ab und dreht
 * danach um), aber sie steht nirgends im Typ — und die Doku der Funktion behauptet
 * bis heute das Gegenteil. Auf eine Zusicherung, die nur aus zwei Zeilen
 * Implementierung besteht, gehört keine Auswahl, deren Fehlgriff ein falsches
 * Original ist.
 */
function carriedOriginalText(state: MaterialState): string {
  const docs = (state.threadAttachments ?? [])
    .filter((a) => !a.isImage && a.extractedText?.trim())
    // Stabil: bei gleichem Zeitstempel (zwei Anhänge desselben Turns) bleibt die
    // Listenreihenfolge, der letzte gewinnt.
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  return docs[docs.length - 1]?.extractedText?.trim() ?? '';
}

async function runStep(
  step: PipelineStep,
  state: ChatGraphState,
  userMessage: string
): Promise<string | null> {
  const start = Date.now();
  try {
    const response = await state.aiWorkerPool.processRequest(
      {
        type: step.requestType,
        provider: LANE.provider,
        systemPrompt: step.systemPrompt,
        // GENAU eine Nachricht, und in ihr steht nur, was `buildUserMessage`
        // hineingelegt hat. Kein `state.messages`, kein Verlauf, keine Anhänge.
        messages: [{ role: 'user', content: userMessage }],
        options: {
          model: LANE.model,
          max_tokens: step.maxTokens,
          temperature: step.temperature ?? 0.2,
        },
      },
      null
    );

    const text = (response.content || '').trim();
    if (!text) {
      log.warn(`[${step.id}] Leere Antwort — Schritt übersprungen`);
      return null;
    }
    log.info(`[${step.id}] ${text.length} Zeichen in ${Date.now() - start}ms`);
    return text;
  } catch (error: unknown) {
    log.warn(
      `[${step.id}] Fehler (fail-open): ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Läuft alle Nachschritte und strömt ihre Ergebnisse an denselben
 * Nachrichtentext an, den Schritt 1 schon gefüllt hat.
 *
 * @returns der angehängte Text (leer, wenn nichts lief). Der Aufrufer hängt ihn
 *   an `fullText`, damit Persistenz und Neuladen denselben Stand sehen wie der
 *   Bildschirm.
 */
export async function runAgentPipeline(params: {
  pipeline: PipelineAgent;
  state: ChatGraphState;
  sse: SSEWriter;
  /** Die fertig gestromte Fassung aus Schritt 1. */
  produced: string;
  /** Der Ausgangstext — dieselbe Zeichenkette, die Schritt 1 gepinnt bekam. */
  original: string;
}): Promise<string> {
  const { pipeline, state, sse, produced, original } = params;

  const producedLength = produced.trim().length;
  if (producedLength < pipeline.minProducedChars) {
    log.info(
      `[${pipeline.identifier}] Antwort nur ${producedLength} Zeichen ` +
        `(< ${pipeline.minProducedChars}) — keine Nachschritte`
    );
    return '';
  }

  let appended = '';
  const emit = (text: string): void => {
    appended += text;
    sse.send('text_delta', { text });
  };

  // Kein Ausgangstext heisst: es gibt nichts zu vergleichen. Das ist der eine
  // Zweig, der früher stumm war — und Stille ist hier die teuerste Antwort,
  // weil eine ungeprüfte Fassung dann genauso aussieht wie eine freigegebene.
  if (!original.trim()) {
    log.warn(`[${pipeline.identifier}] Kein Original gefunden — keine Prüfung`);
    const last = pipeline.steps[pipeline.steps.length - 1];
    emit((last?.heading ?? '\n\n') + pipeline.noOriginalText);
    return appended;
  }

  const previous = new Map<string, string>();

  for (const step of pipeline.steps) {
    const userMessage = step.buildUserMessage({ original, produced, previous });
    if (userMessage === null) {
      emit(step.heading + step.missingText);
      continue;
    }

    sse.send('progress_step', {
      stepId: step.id,
      toolName: pipeline.identifier,
      title: step.title,
      status: 'in_progress',
    });
    const result = await runStep(step, state, userMessage);
    sse.send('progress_step', {
      stepId: step.id,
      toolName: pipeline.identifier,
      title: step.title,
      status: 'completed',
    });

    if (result) {
      previous.set(step.id, result);
      emit(step.heading + result);
    } else {
      // Benannt statt verschwiegen.
      emit(step.heading + step.missingText);
    }
  }

  log.info(
    `[${pipeline.identifier}] Kette fertig: Fassung ${produced.length}c, ` +
      `${previous.size}/${pipeline.steps.length} Schritte geliefert`
  );
  return appended;
}
