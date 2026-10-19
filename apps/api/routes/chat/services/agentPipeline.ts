/**
 * Der Übertragungs-Turn eines Pipeline-Agenten (Einfache / Leichte Sprache).
 *
 * Ablauf: Fassung schreiben → blinde Rückübersetzung → Prüfbericht (als Objekt)
 * → solange das Urteil nicht FREIGABE ist, höchstens zwei Runden aus
 * Überarbeitung und gezielter Nachprüfung. Sehr lange Texte laufen abschnitts-
 * weise durch dieselbe Kette (`sections.ts`).
 *
 * Die Person sieht NUR den fertigen Text. Der Prüfweg — erste Fassung,
 * Rückübersetzung, Bericht, jede Runde, Original — landet in einem
 * Prüfprotokoll-Dokument, dessen Karte unter der Antwort steht. Bis 19.10.2026
 * stand all das als drei Seiten Tabellen im Chat, und am Ende stand eine
 * abgelehnte Fassung, deren Befunde die Person selbst einarbeiten sollte.
 *
 * ── Warum die Schritte eigene Kontexte haben ──
 *
 * Bis zum 13.08.2026 schrieb der Einfache-Sprache-Agent Übertragung,
 * Zuordnungstabelle und Selbstkontrolle in EINE Generierung. Die
 * Selbstkontrolle meldete „vollständig", während ein Ortsname fehlte: wer
 * seinen eigenen Text im eigenen Kontext bewertet, erinnert sich an seine
 * Absicht statt seine Auslassung zu suchen. Deshalb bekommt jeder Schritt genau
 * eine Nachricht, und die Rückübersetzung darin nur die Fassung.
 *
 * Fail-open in jedem Prüfschritt, aber nie stumm: fällt einer aus, bekommt die
 * Person ihre Fassung trotzdem — und liest unter ihr, dass sie ungeprüft ist.
 */

import { intermediateLane } from '../../../agents/langgraph/ChatGraph/llmConfig.js';
import { buildSystemMessage } from '../../../agents/langgraph/ChatGraph/nodes/respondNode.js';
import { aiObject, aiText } from '../../../services/ai/generate.js';
import { isModelSlow, recordSlowVerdict } from '../../../services/ai/modelHealth.js';
import { type ProviderName } from '../../../services/ai/providers.js';
import { type StructuredValidation } from '../../../services/ai/structuredParsing.js';
import { createDocumentWithContent } from '../../../services/docs/DocGenerationService.js';
import { stripPageMarkers } from '../../../services/OcrService/pageMarkers.js';
import { createLogger } from '../../../utils/logger.js';
import {
  NACHPRUEFUNG_JSON_SCHEMA,
  PRUEFBERICHT_JSON_SCHEMA,
  nochOffen,
  nummeriert,
  offenePunkte,
  renderNachpruefung,
  renderPruefbericht,
  urteilAus,
  urteilUeber,
  validateNachpruefung,
  validatePruefbericht,
  type Urteil,
} from '../agents/pipelines/pruefbericht.js';
import { splitForTransfer } from '../agents/pipelines/sections.js';

import { resolveModel } from './responseStreamingService.js';
import { startStepHeartbeat, type SSEWriter } from './sseHelpers.js';
import { INLINE_MATERIAL_MIN_CHARS } from './streamContext.js';

import type { ChatGraphState, CreatedDocument } from '../../../agents/langgraph/ChatGraph/types.js';
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
 *
 * Zwei Kosten dieser Entscheidung, damit sie nicht überrascht:
 *
 * 1. Wer eine Beanstandung EINFÜGT statt sie zu tippen, macht sie zum Original —
 *    genau der Fehler vom 13.08., nur auf einem anderen Weg. Der Preis ist
 *    angenommen: die Beförderung setzt eine leere Eingabezeile voraus, und wer
 *    beanstandet, tippt. Ein Merkmal, das eine eingefügte Kritik von einem
 *    eingefügten Ausgangstext unterscheidet, gibt es nicht.
 * 2. Das Merkmal hängt am Paste-Anhang des Web-Composers. Wo der Text als blosser
 *    Nachrichteninhalt ankommt (Mobile, API-Clients), gibt es keine Beförderung
 *    und weiterhin nur die Länge. Dort steht der Fehler von 14.08. noch.
 */
export function resolveOriginalText(
  state: MaterialState,
  lastUserText: string,
  promptIsPastedText = false
): string {
  // PDF-Anhänge tragen `## Seite N` für das Modell; eine Überarbeitung soll sie
  // nicht als Überschriften übernehmen.
  const material = [state.attachmentContext ?? '', state.documentMentionContext ?? '']
    .map((c) => stripPageMarkers(c))
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
  return stripPageMarkers(docs[docs.length - 1]?.extractedText ?? '');
}

/** Ein Ziel der Lane: Primär oder Sibling. */
type LaneTarget = { provider: ProviderName; model: string };

/** Primär + optionaler Sibling, gegen den nach `hedgeAfterMs` parallel gefragt wird. */
interface LanePair {
  primary: LaneTarget;
  hedge: LaneTarget | null;
}

const PRUEF_LANE: LanePair = {
  primary: { provider: LANE.provider, model: LANE.model },
  hedge: LANE.hedge ?? null,
};

/**
 * Führt den Schritt aus — und schaltet den Sibling der Lane dazu, wenn der
 * Primär zu lange braucht.
 *
 * ── Warum dazuschalten und nicht umschalten ──
 *
 * Am 14.08.2026 antwortete das damalige Primär-Modell mit 3,7 tok/s statt der
 * notierten ~76; der Host selbst war gesund. Eine Störung ist keine Eigenschaft,
 * also wäre ein dauerhafter Modellwechsel die falsche Lehre. Der Sibling tritt
 * deshalb nur DAZU, und sobald der Primär sich fängt, ist der Normalzustand von
 * selbst zurück. Der Preis: greift der Hedge, kostet der Schritt zwei Aufrufe.
 * Deshalb liegt `hedgeAfterMs` weit über der gemessenen Normalzeit.
 *
 * Ausfall UND Langsamkeit sind getrennte Dinge: für den Ausfall gibt es die
 * Fallback-Kette des Providers, hier geht es nur um die Zeit.
 */
async function runStep<T>(
  step: PipelineStep,
  stepId: string,
  lane: LanePair,
  ask: (target: LaneTarget) => Promise<T>,
  size: (result: T) => number
): Promise<T | null> {
  const start = Date.now();
  const attempt = (target: LaneTarget): Promise<[T, LaneTarget]> =>
    ask(target).then((t) => [t, target]);

  const sibling = lane.hedge;
  // Gilt der Primär schon als zäh, wird die Frist nicht noch einmal abgesessen.
  const vermerkt = sibling != null && isModelSlow(lane.primary.provider, lane.primary.model);
  const primary = vermerkt && sibling ? sibling : lane.primary;

  let timer: NodeJS.Timeout | null = null;
  try {
    const attempts: Array<Promise<[T, LaneTarget]>> = [attempt(primary)];

    if (sibling && !vermerkt && step.hedgeAfterMs != null) {
      const frist = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, step.hedgeAfterMs);
        timer.unref?.();
      });
      // Der Sibling tritt an, wenn die Frist um ist ODER der Primär vorher
      // gescheitert ist.
      const gescheitert = attempts[0]!.then(
        () => new Promise<never>(() => {}),
        () => 'gescheitert' as const
      );
      attempts.push(
        Promise.race([frist.then(() => 'zu langsam' as const), gescheitert]).then((grund) => {
          log.info(`[${stepId}] Primär ${grund} — ${sibling.model} tritt dazu`);
          if (grund === 'zu langsam') {
            recordSlowVerdict(lane.primary.provider, lane.primary.model, 'Hedge-Frist gerissen');
          }
          return attempt(sibling);
        })
      );
    }

    const [result, gewinner] = await Promise.any(attempts);
    log.info(
      `[${stepId}] ${size(result)} Zeichen in ${Date.now() - start}ms ` +
        `via ${gewinner.provider}/${gewinner.model}`
    );
    return result;
  } catch (error: unknown) {
    const grund =
      error instanceof AggregateError
        ? error.errors.map((e) => (e instanceof Error ? e.message : String(e))).join(' | ')
        : error instanceof Error
          ? error.message
          : String(error);
    log.warn(`[${stepId}] Fehler (fail-open): ${grund}`);
    return null;
  } finally {
    // Gewinnt der Primär, darf der Wecker nicht mehr klingeln.
    if (timer) clearTimeout(timer);
  }
}

/** Ein Textschritt: GENAU eine Nachricht, kein Verlauf, keine Anhänge. */
function textStep(
  step: PipelineStep,
  lane: LanePair,
  userMessage: string,
  stepId: string = step.id,
  system: string = step.systemPrompt
): Promise<string | null> {
  return runStep(
    step,
    stepId,
    lane,
    async (target) => {
      const text = await aiText({
        lane: step.requestType,
        pinned: target,
        system,
        prompt: userMessage,
        ...(step.timeoutMs != null && { timeoutMs: step.timeoutMs }),
        maxOutputTokens: step.maxTokens,
        temperature: step.temperature ?? 0.2,
      });
      // Als Ablehnung und nicht als leeres Ergebnis: im Wettlauf soll eine
      // leere Antwort den Sibling nicht daran hindern, noch zu gewinnen.
      if (!text) throw new Error(`${target.provider}/${target.model}: leere Antwort`);
      return text;
    },
    (t) => t.length
  );
}

function objectStep<T>(
  step: PipelineStep,
  userMessage: string,
  stepId: string,
  tool: {
    name: string;
    description: string;
    schema: Record<string, unknown>;
    validate: (input: unknown) => StructuredValidation<T>;
  }
): Promise<T | null> {
  return runStep(
    step,
    stepId,
    PRUEF_LANE,
    async (target) => {
      const result = await aiObject<T>({
        lane: step.requestType,
        pinned: target,
        system: step.systemPrompt,
        prompt: userMessage,
        ...(step.timeoutMs != null && { timeoutMs: step.timeoutMs }),
        maxOutputTokens: step.maxTokens,
        temperature: step.temperature ?? 0.2,
        toolName: tool.name,
        toolDescription: tool.description,
        schema: tool.schema,
        validate: tool.validate,
        label: stepId,
      });
      if (!result.ok) throw new Error(`${target.provider}/${target.model}: ${result.error}`);
      return result.data;
    },
    (t) => JSON.stringify(t).length
  );
}

/**
 * Obergrenze für das Original in einem Prüfkontext. Drei Texte plus
 * Systemprompt müssen in ein Fenster passen, und das Original ist der einzige
 * unbegrenzte Teil. Die Kürzung wird ANGESAGT: still gekürzt wäre die
 * Abdeckungsliste unvollständig, ohne dass es jemand merkt. Abschnitte aus
 * `splitForTransfer` liegen weit darunter.
 */
const MAX_ORIGINAL_CHARS = 24000;

function originalBlock(original: string): string {
  const gekuerzt = original.length > MAX_ORIGINAL_CHARS;
  const text = gekuerzt ? original.slice(0, MAX_ORIGINAL_CHARS) : original;
  const hinweis = gekuerzt
    ? '\n\n(Gekürzt — das Original ist länger als hier gezeigt. Beziehe dich nur auf ' +
      'den gezeigten Teil.)'
    : '';
  return `<original>\n${text}${hinweis}\n</original>`;
}

/** Höchstens so viele Runden aus Überarbeitung und Nachprüfung je Abschnitt. */
const MAX_ROUNDS = 2;

type Endstand = Urteil | 'UNGEPRÜFT';

interface PartOutcome {
  final: string;
  endstand: Endstand;
  runden: number;
  offen: number;
  protokoll: string;
}

/** Läuft einen Schritt unter einer eigenen Fortschrittszeile. */
async function withProgress<T>(
  sse: SSEWriter,
  toolName: string,
  stepId: string,
  title: string,
  run: () => Promise<T>
): Promise<T> {
  const progress = { stepId, toolName, title, status: 'in_progress' as const };
  sse.send('progress_step', progress);
  // Ein Prüfschritt ist das längste stumme Fenster im ganzen System (gemessen
  // bis 218 s) — Begründung an `startStepHeartbeat`.
  const stopBeat = startStepHeartbeat(sse, progress);
  try {
    return await run();
  } finally {
    stopBeat();
    sse.send('progress_step', { ...progress, status: 'completed' });
  }
}

/**
 * Prüft EINE Fassung gegen ihr Original und bessert nach, bis die Prüfung
 * freigibt oder `MAX_ROUNDS` erreicht ist.
 */
export async function checkAndRevise(params: {
  pipeline: PipelineAgent;
  sse: SSEWriter;
  original: string;
  fassung: string;
  /** '' bei einem einzigen Abschnitt, sonst „-2" o. ä. für die Schritt-IDs. */
  suffix?: string;
  /** „ (Abschnitt 2 von 3)" für die Fortschrittszeilen. */
  label?: string;
  /**
   * Der Abschnitts-Hinweis aus `sectionNote`. Die Überarbeitung bekommt die
   * Persona samt „Beginne mit dem Titel" — ohne diesen Satz setzte sie jedem
   * mittleren Abschnitt wieder Titel und Schlusshinweis auf.
   */
  sectionRole?: string;
  /**
   * Wer die Überarbeitung schreibt — dieselbe Lane wie die Fassung. Sie
   * schreibt den Text, den die Person am Ende liest; eine ausdrückliche
   * Modellwahl gilt deshalb auch hier. Die Prüfschritte bleiben auf der
   * Prüf-Lane.
   */
  revisionLane?: LanePair;
}): Promise<PartOutcome> {
  const {
    pipeline,
    sse,
    original,
    fassung,
    suffix = '',
    label = '',
    sectionRole = '',
    revisionLane = PRUEF_LANE,
  } = params;
  const { rueck, pruefung, ueberarbeitung, nachpruefung } = pipeline.steps;
  const tool = pipeline.identifier;

  const rueckText = await withProgress(sse, tool, rueck.id + suffix, rueck.title + label, () =>
    // NUR die Fassung. Kein Original, kein Verlauf — sonst ist die Blindheit
    // dahin und der Schritt misst nichts mehr.
    textStep(rueck, PRUEF_LANE, fassung.trim(), rueck.id + suffix)
  );

  const bericht = await withProgress(sse, tool, pruefung.id + suffix, pruefung.title + label, () =>
    objectStep(
      pruefung,
      `${originalBlock(original)}\n\n<fassung>\n${fassung}\n</fassung>\n\n` +
        (rueckText
          ? `<rueckuebersetzung>\n${rueckText}\n</rueckuebersetzung>`
          : // Benannt statt weggelassen — sonst prüft das Modell zwei Texte und meldet es nicht.
            '<rueckuebersetzung>\n(Die Rückübersetzung ist nicht zustande gekommen. ' +
            'Prüfe ohne sie und sage das.)\n</rueckuebersetzung>'),
      pruefung.id + suffix,
      {
        name: 'pruefbericht',
        description: 'Gibt den vollständigen Prüfbericht der Fassung zurück.',
        schema: PRUEFBERICHT_JSON_SCHEMA,
        validate: validatePruefbericht,
      }
    )
  );

  const protokoll: string[] = [
    '### Erste Fassung',
    hardBreaks(fassung),
    '### Rückübersetzung (blind erstellt)',
    rueckText ?? '_Die blinde Rückübersetzung ist nicht zustande gekommen._',
  ];

  if (!bericht) {
    protokoll.push('### Prüfbericht', '_Die Prüfung ist nicht zustande gekommen._');
    return {
      final: fassung,
      endstand: 'UNGEPRÜFT',
      runden: 0,
      offen: 0,
      protokoll: protokoll.join('\n\n'),
    };
  }

  let urteil: Endstand = urteilAus(bericht);
  let offen = offenePunkte(bericht);
  protokoll.push('### Prüfbericht', renderPruefbericht(bericht, urteil));

  let current = fassung;
  let runden = 0;
  while (urteil !== 'FREIGABE' && offen.length > 0 && runden < MAX_ROUNDS) {
    runden++;
    const runde = `${suffix}-r${runden}`;
    const punkte = nummeriert(offen);
    const neu = await withProgress(
      sse,
      tool,
      ueberarbeitung.id + runde,
      `${ueberarbeitung.title}${label} (Runde ${runden})`,
      () =>
        textStep(
          ueberarbeitung,
          revisionLane,
          `${originalBlock(original)}\n\n<fassung>\n${current}\n</fassung>\n\n<punkte>\n${punkte}\n</punkte>`,
          ueberarbeitung.id + runde,
          ueberarbeitung.systemPrompt + sectionRole
        )
    );
    if (!neu) {
      protokoll.push(
        `### Überarbeitung, Runde ${runden}`,
        '_Die Überarbeitung ist nicht zustande gekommen._'
      );
      break;
    }

    const np = await withProgress(
      sse,
      tool,
      nachpruefung.id + runde,
      `${nachpruefung.title}${label} (Runde ${runden})`,
      () =>
        objectStep(
          nachpruefung,
          `${originalBlock(original)}\n\n<vorige_fassung>\n${current}\n</vorige_fassung>\n\n` +
            `<neue_fassung>\n${neu}\n</neue_fassung>\n\n<punkte>\n${punkte}\n</punkte>`,
          nachpruefung.id + runde,
          {
            name: 'nachpruefung',
            description: 'Meldet je Punkt, ob die neue Fassung ihn behebt, und neue Befunde.',
            schema: NACHPRUEFUNG_JSON_SCHEMA,
            validate: validateNachpruefung,
          }
        )
    );
    protokoll.push(`### Überarbeitung, Runde ${runden}`, hardBreaks(neu));
    current = neu;
    if (!np) {
      // Die neue Fassung geht raus — sie arbeitet die Befunde ab —, aber als
      // ungeprüft, denn niemand hat nachgesehen, ob sie es tut.
      protokoll.push(
        `### Nachprüfung, Runde ${runden}`,
        '_Die Nachprüfung ist nicht zustande gekommen._'
      );
      urteil = 'UNGEPRÜFT';
      break;
    }
    const rest = nochOffen(offen, np);
    protokoll.push(`### Nachprüfung, Runde ${runden}`, renderNachpruefung(offen, np, rest));
    offen = rest;
    urteil = urteilUeber(offen);
  }

  return {
    final: current,
    endstand: urteil,
    runden,
    offen: urteil === 'FREIGABE' ? 0 : offen.length,
    protokoll: protokoll.join('\n\n'),
  };
}

/**
 * Eine Zeile bleibt eine Zeile. Leichte Sprache schreibt einen Satz pro Zeile;
 * Markdown zieht einfache Umbrüche sonst zu einem Absatz zusammen — im Chat zu
 * Fliesstext, im Dokument sogar Satz an Satz ohne Leerzeichen.
 */
function hardBreaks(text: string): string {
  return text.replace(/([^\n])\n(?=[^\n])/g, '$1  \n');
}

/** Schlechtester Endstand zuerst — er bestimmt, was unter dem Text steht. */
const ENDSTAND_RANG: Record<Endstand, number> = {
  ABLEHNUNG: 0,
  UNGEPRÜFT: 1,
  ÜBERARBEITUNG: 2,
  FREIGABE: 3,
};

function sectionNote(i: number, n: number): string {
  if (n === 1) return '';
  const rolle =
    i === 0
      ? 'Beginne mit Titel und „Worum geht es?" für den GANZEN Text; den Hinweis auf die Übersetzung schreibst du NICHT — er kommt am Ende des letzten Abschnitts.'
      : i === n - 1
        ? 'Schreibe KEINEN Titel und kein „Worum geht es?" — die stehen schon über dem ersten Abschnitt. Beginne direkt mit der ersten Zwischenüberschrift und ende mit dem Hinweis auf die Übersetzung.'
        : 'Schreibe KEINEN Titel, kein „Worum geht es?" und keinen Hinweis auf die Übersetzung. Beginne direkt mit der ersten Zwischenüberschrift.';
  return `\n\n## ABSCHNITT ${i + 1} VON ${n}\nDer Text unter ZU ÜBERTRAGENDER TEXT ist Abschnitt ${i + 1} von ${n} eines längeren Textes. Übertrage nur ihn, vollständig. ${rolle}`;
}

/**
 * Der Riegel hinter `sectionNote`: ein Abschnitt, der trotzdem einen eigenen
 * Titel, ein „Worum geht es?" oder den Schlusshinweis mitbringt, verliert sie
 * hier. Der Prompt bittet, der Code sorgt dafür — zusammengesetzt stünden die
 * Rahmen sonst mitten im Text.
 */
export function trimSectionFrame(text: string, i: number, n: number): string {
  if (n === 1) return text;
  let out = text.trim();
  if (i > 0) {
    out = out.replace(/^#\s[^\n]*\n+/, '');
    out = out.replace(/^##\s*Worum geht es\?[^\n]*\n[\s\S]*?(?=^##\s)/m, '');
  }
  if (i < n - 1) {
    const hinweis = out.search(
      /^Das ist (ein Text in Leichter Sprache|eine Übersetzung in Einfache Sprache)\./m
    );
    if (hinweis > 0) out = out.slice(0, hinweis);
  }
  return out.trim();
}

function statusLine(endstand: Endstand, runden: number, offen: number): string {
  if (endstand === 'FREIGABE') return '';
  if (endstand === 'UNGEPRÜFT') {
    return '\n\n_Diese Fassung ist **ungeprüft**, weil ein Prüfschritt ausgefallen ist. Lass sie vor der Veröffentlichung gegenlesen._';
  }
  const nach =
    runden > 0 ? `Nach ${runden} Überarbeitung${runden > 1 ? 'en' : ''} sind` : 'Es sind';
  return `\n\n_${nach} noch ${offen} Prüfpunkt${offen === 1 ? '' : 'e'} offen — Details im Prüfprotokoll. Lass die Fassung vor der Veröffentlichung gegenlesen._`;
}

/** Wie viele Abschnitte gleichzeitig laufen — jeder hält bis zu drei Aufrufe offen. */
const SECTION_CONCURRENCY = 3;

async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface TransferTurnResult {
  fullText: string;
  createdDocument: CreatedDocument | null;
}

/**
 * Der ganze Turn: Fassung(en) schreiben, prüfen, nachbessern, Protokoll
 * ablegen — und am Ende EINMAL den fertigen Text senden.
 */
export async function runTransferTurn(params: {
  pipeline: PipelineAgent;
  state: ChatGraphState;
  sse: SSEWriter;
  original: string;
  /** Die getippte Anweisung, wenn sie nicht selbst das Original ist. */
  instruction: string;
  userId: string;
  modelId: string | null | undefined;
  requestId: string;
}): Promise<TransferTurnResult> {
  const { pipeline, state, sse, original, instruction, userId, modelId, requestId } = params;
  const tool = pipeline.identifier;

  // Dieselbe Modellwahl wie der gewöhnliche Antwortpfad — `auto` landet über
  // die Pipeline-Regel in `resolveAutoSelection` auf der Pipeline-Lane, eine
  // ausdrückliche Wahl der Person bleibt ihre Wahl.
  const resolution = await resolveModel(
    {
      provider: state.agentConfig.provider as string,
      model: state.agentConfig.model,
      ...(state.agentConfig.defaultModel != null && {
        defaultModel: state.agentConfig.defaultModel,
      }),
    },
    modelId ?? undefined,
    requestId,
    { intent: state.intent, agentId: tool }
  );
  const fassungLane: LanePair = {
    primary: { provider: resolution.provider as ProviderName, model: resolution.modelName },
    hedge: resolution.sibling
      ? { provider: resolution.sibling.provider as ProviderName, model: resolution.sibling.model }
      : null,
  };

  const sections = splitForTransfer(original);
  const n = sections.length;
  log.info(`[${tool}] Übertragung: ${original.length} Zeichen in ${n} Abschnitt(en)`);

  // Die Persona des Agenten MUSS hier gelten. Eine Thread-Rolle
  // (`customSystemPrompt`) ersetzt im Antwortknoten den ganzen Agenten-Prompt —
  // samt Regelwerk und angeheftetem Ausgangstext — und übrig bliebe eine
  // gewöhnliche Antwort im Fachdeutsch.
  const transferSection = async (section: string, i: number): Promise<PartOutcome | null> => {
    const suffix = n > 1 ? `-${i + 1}` : '';
    const system =
      (await buildSystemMessage({
        ...state,
        customSystemPrompt: null,
        pipelineSourceText: section,
      })) + sectionNote(i, n);
    const step = pipeline.steps.fassung;
    const fassung = await withProgress(
      sse,
      tool,
      step.id + suffix,
      n > 1 ? `Übertrage Abschnitt ${i + 1} von ${n}…` : step.title,
      () =>
        textStep(
          step,
          fassungLane,
          instruction || `Übertrage den Text in ${pipeline.registerName}.`,
          step.id + suffix,
          system
        )
    );
    if (!fassung) return null;
    const part = await checkAndRevise({
      pipeline,
      sse,
      original: section,
      fassung: trimSectionFrame(fassung, i, n),
      revisionLane: fassungLane,
      ...(n > 1 && {
        suffix,
        label: ` (Abschnitt ${i + 1} von ${n})`,
        sectionRole: sectionNote(i, n),
      }),
    });
    return { ...part, final: trimSectionFrame(part.final, i, n) };
  };

  // Abschnitte laufen nebeneinander, jeder mit seiner ganzen Kette — einer nach
  // dem anderen hiesse bei einem 100k-Text eine Viertelstunde Warten.
  const results = await mapWithLimit(sections, SECTION_CONCURRENCY, transferSection);
  if (results.some((r) => r === null)) {
    const fail = `Die Fassung ist nicht zustande gekommen. Bitte versuche es noch einmal.`;
    sse.send('response_start', { message: '' });
    sse.send('text_delta', { text: fail });
    return { fullText: fail, createdDocument: null };
  }
  const parts = results as PartOutcome[];

  const endstand = parts.reduce<Endstand>(
    (worst, p) => (ENDSTAND_RANG[p.endstand] < ENDSTAND_RANG[worst] ? p.endstand : worst),
    'FREIGABE'
  );
  const runden = Math.max(...parts.map((p) => p.runden));
  const offen = parts.reduce((sum, p) => sum + p.offen, 0);
  const finalText = parts.map((p) => p.final.trim()).join('\n\n');

  const titel =
    /^#\s+(.+)$/m.exec(finalText)?.[1]?.trim() ??
    finalText
      .split('\n')
      .find((l) => l.trim())
      ?.replace(/^[#*\s]+|[*\s]+$/g, '')
      .slice(0, 120) ??
    pipeline.registerName;
  const protokoll = [
    `# Prüfprotokoll: ${titel}`,
    `Urteil: ${endstand}\n\nRunden: ${runden}`,
    `Dieses Protokoll gehört zu einer Übertragung (${pipeline.registerName}). Es hält fest, wie die Fassung im Chat geprüft wurde: erste Fassung, blinde Rückübersetzung, Prüfbericht und jede Überarbeitung mit ihrer Nachprüfung.`,
    ...parts.flatMap((p, i) => [
      ...(n > 1 ? [`## Abschnitt ${i + 1} von ${n} — ${p.endstand}`] : []),
      p.protokoll,
    ]),
    '## Fertige Fassung',
    hardBreaks(finalText),
    '## Original',
    hardBreaks(original),
  ].join('\n\n');

  let createdDocument: CreatedDocument | null = null;
  try {
    const doc = await createDocumentWithContent(
      `Prüfprotokoll: ${titel}`,
      protokoll,
      'blank',
      userId
    );
    createdDocument = {
      documentId: doc.id,
      title: doc.title,
      subtype: 'blank',
      url: `/office/${doc.id}`,
      // Die Antwort ist der Text im Chat; das Protokoll liegt daneben.
      background: true,
    };
  } catch (error: unknown) {
    log.warn(
      `[${tool}] Prüfprotokoll nicht angelegt: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Auch im Chat: ohne harte Umbrüche zieht Markdown die Ein-Satz-Zeilen der
  // Leichten Sprache zu einem Fliesstextblock zusammen.
  const fullText = hardBreaks(finalText) + statusLine(endstand, runden, offen);
  sse.send('response_start', { message: '' });
  sse.send('text_delta', { text: fullText });
  if (createdDocument) sse.send('document_created', createdDocument);

  log.info(
    `[${tool}] Kette fertig: ${n} Abschnitt(e), Endstand ${endstand}, ${runden} Runde(n), ` +
      `${offen} offen, Fassung ${finalText.length}c`
  );
  return { fullText, createdDocument };
}
