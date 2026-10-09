/**
 * Artifact generation cores — pure generation, no stream ownership.
 *
 * Extracted from intentExecutionService so the per-kind descriptor table
 * (artifactKinds.ts) can reference them without an import cycle. Each core
 * runs the model through `aiObject`, validates, writes the artifact and
 * returns a descriptor — or null when the model produced nothing usable. NO
 * SSE, NO persistence, NO turn ownership: those live in runCreateTurn for the
 * single-pass path and in the loop's fat tools for the compound path, which is
 * exactly why both can share these.
 */

import {
  extractLocaleFromRequest,
  type RequestWithLocale,
} from '../../../services/localization/index.js';
import { createLogger } from '../../../utils/logger.js';

import type {
  ChatGraphState,
  CreatedDocument,
  SearchResult,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { CreatePdfResult } from '../../../services/pdf/PdfGenerationService.js';
import type { ExplainableSource } from '@gruenerator/contracts';

const log = createLogger('ChatGraphController');

/**
 * Thrown by an `ArtifactSpec.generate` when the refusal has a sentence of its
 * own the person should read (an exhausted budget) instead of the spec's
 * generic `errorText`. Lives here rather than in createTurn.ts so the
 * descriptor table can throw it without importing the persistence layer.
 */
export class CreateRefusedError extends Error {}

/**
 * Resolve the author name for quote sharepics / PDF letterheads from the user's
 * profile. Returns an empty string when no userId or display name is available
 * — the artifact then renders without an author line instead of failing.
 */
export async function resolveSharepicAuthorName(userId?: string): Promise<string> {
  if (!userId) return '';
  try {
    const { getProfileService } = await import('../../../services/user/ProfileService.js');
    const profile = await getProfileService().getProfileById(userId);
    return profile?.display_name?.trim() || '';
  } catch (err) {
    log.warn(`[ChatGraph] Could not resolve sharepic author name: ${err}`);
    return '';
  }
}

/**
 * Loop-safe document generation core (presentation / sheet / text doc). Pure
 * generation: runs the AI worker pool, parses the structure and creates the
 * collaborative document — NO SSE, NO persistence, NO stream ownership. Shared
 * by the turn-owning handlers (which wrap it with
 * response_start/done/createMessage) AND the compound loop fat tools (which emit
 * `document_created` + hand the card back to the model). Returns null when the
 * model produced no parseable structure; the turn-owning handlers then report a
 * templated error via `failCreation` (never a fall-through to the responder),
 * the loop surfaces it as a tool failure.
 */
export interface PdfGenerationOptions {
  /** Steers the layout; the generation model may still upgrade to a letter. */
  documentKind?: 'document' | 'letter' | 'form';
  sender?: { name?: string | null; organization?: string | null; address?: string | null } | null;
  userLocale?: 'de-DE' | 'de-AT';
}

const PDF_LETTER_RE =
  /\b(briefkopf|anschreiben|brief(e|es|s)?|einladungsschreiben|offiziell\w*\s+schreiben)\b/i;
const PDF_FORM_RE =
  /\b(formular\w*|antragsformular|anmeldeformular|fragebogen|ausf(ü|ue)llbar\w*|zum\s+ausf(ü|ue)llen|eintragungsliste|anmeldebogen|beitrittserkl(ä|ae)rung)\b/i;

/**
 * Which layout the user asked for. Deliberately narrow — bare "schreiben" is
 * almost always the verb, and the generation model still upgrades a document to
 * a letter when it fills in recipient/salutation.
 */
export function pdfKindFromText(text: string): 'document' | 'letter' | 'form' {
  if (PDF_FORM_RE.test(text)) return 'form';
  if (PDF_LETTER_RE.test(text)) return 'letter';
  return 'document';
}

/**
 * Was this generation written off while it was still running?
 *
 * The loop's per-call timeout abandons a call, it does not cancel it (see
 * `wrapTools`). Generation is the one place where that difference is visible to
 * the user: the abandoned call would finish, write a document and push an
 * artifact card into a turn that had already reported failure — and, because the
 * loop then force-starts a replacement, leave two documents behind for one ask.
 *
 * Checked at the LAST possible moment, right where `onCommit` sits: everything
 * before it is a read, everything after it is a write. Nothing is created, so
 * there is nothing to roll back.
 */
function abandonedBeforeCommit(signal: AbortSignal | undefined, what: string): boolean {
  if (signal?.aborted !== true) return false;
  log.warn(`[ChatGraph] ${what} abandoned before commit (per-call timeout) — not writing`);
  return true;
}

/**
 * PDF generation has its own entry point rather than a `runDocGeneration`
 * branch: it produces a finished file plus a verification report, not a
 * collaborative document, so the return shape genuinely differs.
 */
export async function runPdfGeneration(opts: {
  userContent: string;
  req: Express.Request;
  userId: string;
  pdfOptions?: PdfGenerationOptions;
  onCommit?: () => void;
  /** See {@link abandonedBeforeCommit}. */
  abandoned?: AbortSignal;
}): Promise<CreatePdfResult | null> {
  const { userContent, userId, onCommit } = opts;
  const { PDF_GENERATION_PROMPT, validatePdfStructure, createPdfDocument } =
    await import('../../../services/pdf/PdfGenerationService.js');
  const { PDF_DOCUMENT_TOOL_SCHEMA } = await import('../../../services/pdf/pdfDocument.js');
  const { aiObject } = await import('../../../services/ai/generate.js');

  const pdfOptions = opts.pdfOptions ?? {};
  const directive =
    pdfOptions.documentKind === 'letter'
      ? 'Der Nutzer möchte ein offizielles Schreiben mit Briefkopf. Setze "kind":"letter" und fülle das "letter"-Objekt aus.\n\n'
      : pdfOptions.documentKind === 'form'
        ? 'Der Nutzer möchte ein ausfüllbares Formular. Setze "kind":"form" und baue passende field-Blöcke.\n\n'
        : '';

  // Shared by the first pass and the repair below, which differ only in their
  // user content, temperature and attempt budget.
  const pdfCall = {
    lane: 'doc_generation' as const,
    system: PDF_GENERATION_PROMPT,
    toolName: 'create_pdf_document',
    toolDescription: 'Erzeugt ein fertiges PDF-Dokument aus Titel und Inhaltsblöcken.',
    schema: PDF_DOCUMENT_TOOL_SCHEMA,
    validate: validatePdfStructure,
  };

  const generated = await aiObject({
    ...pdfCall,
    prompt: `${directive}${userContent}`,
    temperature: 0.5,
    label: 'pdf',
  });
  if (!generated.ok) {
    log.warn(`[ChatGraph] PDF generation returned no usable structure: ${generated.error}`);
    return null;
  }
  const structure = generated.data;
  if (abandonedBeforeCommit(opts.abandoned, 'PDF generation')) return null;
  onCommit?.();

  const isLetter = structure.kind === 'letter' || pdfOptions.documentKind === 'letter';

  // Der gespeicherte Briefkopf gilt auch hier. Das fehlte: der Chat-Pfad hat
  // nur den Profilnamen gesetzt, also stand auf einem per Chat erzeugten Brief
  // weder Organisation noch Anschrift — und die Versandoptionen aus den
  // Einstellungen griffen gar nicht.
  const { resolveLetterheadOptions } = await import('../../exports/letterheadSender.js');
  const letterhead = await resolveLetterheadOptions(userId);

  // Sender defaults to the profile display name so a letterhead never renders
  // an empty Absender block.
  let sender = pdfOptions.sender ?? letterhead.sender;
  if (isLetter && !sender?.name && !sender?.organization) {
    const profileName = await resolveSharepicAuthorName(userId);
    if (profileName) sender = { ...sender, name: profileName };
  }

  return createPdfDocument(structure, {
    userId,
    locale: pdfOptions.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
    sender,
    dispatchMode: letterhead.dispatchMode,
    returnLine: letterhead.returnLine,
    foldMarks: letterhead.foldMarks,
    stationery: letterhead.stationery,
    // Bounded self-repair, in the shape computeVerifierNode + resumePipeline
    // already use for compute: the self-check's findings go back to the model
    // once. `createPdfDocument` owns WHEN this is called (only for findings a
    // rewrite can fix) and whether the result is kept (only if it improved).
    regenerate: async (problems) => {
      const repaired = await aiObject({
        ...pdfCall,
        prompt:
          `${directive}${userContent}\n\n` +
          `Dein vorheriger Entwurf hatte diese Mängel:\n` +
          `${problems.map((p) => `- ${p}`).join('\n')}\n\n` +
          `Gib das VOLLSTÄNDIGE Dokument korrigiert erneut aus. Behalte Inhalt und ` +
          `Aussage bei; ändere nur, was zur Behebung nötig ist.`,
        // The first pass already spent its creativity; a repair is deterministic.
        temperature: 0,
        attempts: 1,
        label: 'pdf-repair',
      });
      return repaired.ok ? repaired.data : null;
    },
  });
}

export async function runDocGeneration(opts: {
  kind: 'presentation' | 'sheet' | 'document';
  userContent: string;
  req: Express.Request;
  userId: string;
  /** Invoked ONCE, after the model produced a parseable structure but BEFORE
   *  the DB write. The turn-owning handlers use it to open the stream at the
   *  original commit point (`response_start`) so a create failure still surfaces
   *  the in-stream error rather than falling through; the loop fat tool omits
   *  it (the loop owns the stream). */
  onCommit?: () => void;
  /** See {@link abandonedBeforeCommit}. */
  abandoned?: AbortSignal;
  /** kind 'document' only: subtype hint from the classifier. Validated before
   *  use — see below. */
  subtypeOverride?: string | null;
  /** kind 'document' only: prior exchange save_as_doc turns into a document. */
  conversationContext?: string;
}): Promise<CreatedDocument | null> {
  const { kind, userContent, req, userId, onCommit } = opts;
  const reqWithUser = req as Express.Request & {
    user?: { id?: string; locale?: string };
    sessionID?: string;
  };
  const { aiObject } = await import('../../../services/ai/generate.js');
  const { viaLaxParser, withContent } = await import('../../../services/ai/structuredParsing.js');

  if (kind === 'presentation') {
    const {
      PRESENTATION_GENERATION_PROMPT,
      PRESENTATION_TOOL_SCHEMA,
      parsePresentationStructure,
      createPresentationDocument,
      findEmptySlides,
    } = await import('../../../services/presentations/PresentationGenerationService.js');
    const parseAndCheckSlides = viaLaxParser(
      parsePresentationStructure,
      'title oder slides fehlen'
    );
    const generated = await aiObject({
      lane: 'doc_generation',
      system: PRESENTATION_GENERATION_PROMPT,
      prompt: userContent,
      toolName: 'create_presentation',
      toolDescription: 'Erzeugt die Folienstruktur der Präsentation.',
      schema: PRESENTATION_TOOL_SCHEMA,
      // A blank slide is a broken structure, not a success — rejecting it here
      // buys a repair attempt with a message that names the offending slides,
      // rather than shipping the deck and burying the gap in speaker notes.
      // This gate used to be bypassed whenever the provider answered with text
      // instead of a tool call, because that path ran the bare parser.
      validate: (input) => {
        const parsed = parseAndCheckSlides(input);
        if (!parsed.ok) return parsed;
        const empty = findEmptySlides(parsed.value);
        if (empty.length === 0) return parsed;
        return {
          ok: false as const,
          error: `Folien ohne Inhalt: ${empty.join(', ')} — jede Folie mit Layout content/split/quote braucht einen gefüllten body.`,
        };
      },
      temperature: 0.4,
      label: 'presentation',
    });
    if (!generated.ok) {
      log.warn(`[ChatGraph] Presentation generation failed: ${generated.error}`);
      return null;
    }
    if (abandonedBeforeCommit(opts.abandoned, 'Presentation generation')) return null;
    onCommit?.();
    // Leeres Profil: nur ein AT-Header stempelt die Marke, sonst bleibt sie offen.
    const brandLocale =
      reqWithUser.user?.locale ??
      (extractLocaleFromRequest(req as RequestWithLocale) === 'de-AT' ? 'de-AT' : null);
    const doc = await createPresentationDocument(generated.data, userId, brandLocale);
    return {
      documentId: doc.id,
      title: doc.title,
      subtype: 'presentations',
      url: `/office/${doc.id}`,
    };
  }

  if (kind === 'sheet') {
    const { SHEET_GENERATION_PROMPT, SHEET_TOOL_SCHEMA, parseSheetStructure, createSheetDocument } =
      await import('../../../services/sheets/SheetGenerationService.js');
    const generated = await aiObject({
      lane: 'doc_generation',
      system: SHEET_GENERATION_PROMPT,
      prompt: userContent,
      toolName: 'create_sheet',
      toolDescription: 'Erzeugt die Tabellenstruktur (Blätter, Spalten, Zeilen).',
      schema: SHEET_TOOL_SCHEMA,
      validate: viaLaxParser(parseSheetStructure, 'title oder sheets fehlen'),
      temperature: 0.4,
      label: 'sheet',
    });
    if (!generated.ok) {
      log.warn(`[ChatGraph] Sheet generation failed: ${generated.error}`);
      return null;
    }
    if (abandonedBeforeCommit(opts.abandoned, 'Sheet generation')) return null;
    onCommit?.();
    const doc = await createSheetDocument(generated.data, userId);
    return { documentId: doc.id, title: doc.title, subtype: 'sheets', url: `/office/${doc.id}` };
  }

  // kind === 'document' — a free-form text document (DocGenerationService picks
  // the subtype). Unlike the turn-owning generateAndCreateDocument, the loop
  // core returns null on a generation failure instead of writing a blank doc:
  // an empty doc from a researched compound turn is worse than a tool error the
  // model can explain.
  const {
    DOCUMENT_GENERATION_PROMPT,
    DOCUMENT_TOOL_SCHEMA,
    GENERATED_DOC_SUBTYPES,
    parseDocumentResponse,
    createDocumentWithContent,
  } = await import('../../../services/docs/DocGenerationService.js');

  const subtypeOverride = opts.subtypeOverride ?? null;
  const subtypeHint = subtypeOverride ? `\nVerwende subtype: "${subtypeOverride}".` : '';
  const userMessage = opts.conversationContext
    ? `Konversationskontext:\n${opts.conversationContext}\n\nAktuelle Anfrage: ${userContent}`
    : userContent;

  const generated = await aiObject({
    lane: 'doc_generation',
    system: DOCUMENT_GENERATION_PROMPT + subtypeHint,
    prompt: userMessage,
    toolName: 'create_document',
    toolDescription: 'Erzeugt das Dokument als HTML mit Titel und subtype.',
    schema: DOCUMENT_TOOL_SCHEMA,
    validate: viaLaxParser(withContent(parseDocumentResponse), 'content fehlt oder ist leer'),
    temperature: 0.7,
    label: 'document',
  });
  if (!generated.ok) {
    log.warn(`[ChatGraph] Document generation failed: ${generated.error}`);
    return null;
  }
  const parsed = generated.data;
  if (abandonedBeforeCommit(opts.abandoned, 'Document generation')) return null;
  onCommit?.();

  // The override wins over the generator's own (validated) subtype, so it must
  // be validated too — it originates from the classifier, which can hallucinate
  // a plausible-but-invalid value. An unknown override is dropped rather than
  // used, leaving the generator's choice in place.
  const overrideIsValid =
    subtypeOverride != null && GENERATED_DOC_SUBTYPES.includes(subtypeOverride);
  if (subtypeOverride && !overrideIsValid) {
    log.warn(`[ChatGraph] Ignoring invalid document subtype override "${subtypeOverride}"`);
  }
  const subtype = overrideIsValid ? subtypeOverride : parsed.subtype;

  const doc = await createDocumentWithContent(parsed.title, parsed.content, subtype, userId);
  return {
    documentId: doc.id,
    title: parsed.title,
    subtype,
    url: `/office/${doc.id}`,
  };
}

export interface CreatedBoard {
  boardId: string;
  title: string;
  /** Post-processed board structure — carried in the loop's `done` event so the
   *  boards UI renders it live (boards have no `document_created`/card path). */
  boardGeneratedStructure: unknown;
  /** Column names and card count for the confirmation text. Carried here so the
   *  turn handler can delegate generation instead of re-running it inline just
   *  to keep hold of the raw structure. */
  columnNames: string[];
  cardCount: number;
}

/**
 * Loop-safe board generation core, extracted from `handleBoardCreation`. Pure:
 * generates + creates the board row, returns the descriptor (incl. the
 * post-processed structure the UI needs). NO SSE/stream ownership. Returns null
 * when the model produced no parseable board structure.
 */
export async function runBoardGeneration(opts: {
  userContent: string;
  req: Express.Request;
  userId: string;
  /** Invoked ONCE after a parseable structure but BEFORE the DB write — same
   *  commit point as runDocGeneration/runPdfGeneration, so the turn handler can
   *  open the stream there instead of eagerly. */
  onCommit?: () => void;
  /** See {@link abandonedBeforeCommit}. */
  abandoned?: AbortSignal;
}): Promise<CreatedBoard | null> {
  const { userContent, userId, onCommit } = opts;
  const {
    BOARD_GENERATION_PROMPT,
    BOARD_TOOL_SCHEMA,
    createBoardDocument,
    parseBoardStructure,
    postProcessBoardStructure,
  } = await import('../../../services/boards/BoardService.js');
  const { aiObject } = await import('../../../services/ai/generate.js');
  const { viaLaxParser } = await import('../../../services/ai/structuredParsing.js');

  const generated = await aiObject({
    lane: 'board_generation',
    system: BOARD_GENERATION_PROMPT,
    prompt: userContent,
    toolName: 'create_board',
    toolDescription: 'Erzeugt die Board-Struktur aus Spalten und Aufgabenkarten.',
    schema: BOARD_TOOL_SCHEMA,
    validate: viaLaxParser(parseBoardStructure, 'statusOptions oder rows fehlen'),
    temperature: 0.7,
    label: 'board',
  });
  if (!generated.ok) {
    log.warn(`[ChatGraph] Board generation failed: ${generated.error}`);
    return null;
  }
  const structure = generated.data;
  if (abandonedBeforeCommit(opts.abandoned, 'Board generation')) return null;
  onCommit?.();
  const { id, title } = await createBoardDocument(structure.title || 'Neues Board', userId);
  return {
    boardId: id,
    title,
    boardGeneratedStructure: postProcessBoardStructure(structure, userId),
    columnNames: structure.statusOptions.map((c: { name: string }) => c.name),
    cardCount: structure.rows.length,
  };
}

/** presentation/sheet subtypes route the sticky pointer to their own kind. */
export function documentContextKind(subtype: string): 'presentation' | 'sheet' | 'document' {
  if (subtype.startsWith('presentation')) return 'presentation';
  if (subtype.startsWith('sheet')) return 'sheet';
  return 'document';
}

/**
 * The source list an explainable stores, numbered exactly as
 * `renderSourceLines` numbered the brief: results without content are skipped
 * there, so they must be skipped here, or every `[n]` in the text would point
 * one source too far.
 */
export function explainableSourcesFromResults(results: SearchResult[]): ExplainableSource[] {
  return results
    .filter((r) => (r.content ?? '').trim())
    .map((r, i) => ({
      index: i + 1,
      title: r.title || r.url || `Quelle ${i + 1}`,
      url: r.url || null,
    }));
}

export type ExplainableGenerationOutcome =
  | { ok: true; document: CreatedDocument; imageCount: number }
  | {
      ok: false;
      code: 'budget_exhausted' | 'budget_unavailable' | 'generation_failed';
      message: string;
    };

/**
 * Explainable generation. Unlike the other cores the write is not ours:
 * `createExplainable` generates and persists in one call (text synchronously,
 * the illustrations later in a worker), so there is no point between "usable
 * structure" and "write" to put `onCommit`. It fires before the call instead —
 * the stream then shows progress during the 10–20 s of text generation, and a
 * failure still surfaces in-stream because the create turn owns it either way.
 *
 * Returns null only when the loop abandoned the call before it started.
 */
export async function runExplainableGeneration(opts: {
  brief: string;
  sources: ExplainableSource[];
  userId: string;
  threadId: string | null;
  locale: 'de-DE' | 'de-AT';
  onCommit?: () => void;
  /** See {@link abandonedBeforeCommit}. */
  abandoned?: AbortSignal;
}): Promise<ExplainableGenerationOutcome | null> {
  if (abandonedBeforeCommit(opts.abandoned, 'Explainable generation')) return null;
  opts.onCommit?.();
  const { createExplainable } = await import('../../../services/explainables/createExplainable.js');
  const result = await createExplainable({
    userId: opts.userId,
    brief: opts.brief,
    sources: opts.sources,
    threadId: opts.threadId,
    sourceMessageId: null,
    locale: opts.locale,
  });
  if (!result.ok) {
    log.warn(`[ChatGraph] Explainable generation failed (${result.code}): ${result.message}`);
    return { ok: false, code: result.code, message: result.message };
  }
  return {
    ok: true,
    document: {
      documentId: result.id,
      title: result.title,
      subtype: 'explainable',
      url: result.url,
    },
    imageCount: result.imageCount,
  };
}

/**
 * The German sentence for a refused explainable. Budget exhaustion is the one
 * failure a person can act on (wait, or ask without pictures), so it is named.
 */
/** Budget refusals carry the tree-budget sentence with the real numbers. */
export function explainableRefusalText(
  outcome: Extract<ExplainableGenerationOutcome, { ok: false }>
): string {
  return outcome.code === 'budget_exhausted'
    ? outcome.message
    : explainableFailureText(outcome.code);
}

export function explainableFailureText(
  code: Extract<ExplainableGenerationOutcome, { ok: false }>['code']
): string {
  return code === 'budget_exhausted'
    ? 'Dein Kontingent für Explainables ist im Moment aufgebraucht, deshalb habe ich keins erstellt. Ich kann das Thema aber gern hier im Chat einfach erklären.'
    : code === 'budget_unavailable'
      ? 'Ich konnte gerade nicht prüfen, ob noch Kontingent für Explainables frei ist, deshalb habe ich keins erstellt. Versuch es bitte gleich noch einmal.'
      : 'Das Explainable konnte nicht erstellt werden. Versuch es bitte noch einmal mit einer kurzen Beschreibung des Themas.';
}
