/**
 * Artifact generation cores — pure generation, no stream ownership.
 *
 * Extracted from intentExecutionService so the per-kind descriptor table
 * (artifactKinds.ts) can reference them without an import cycle. Each core
 * runs the model through generateStructured, validates, writes the artifact and
 * returns a descriptor — or null when the model produced nothing usable. NO
 * SSE, NO persistence, NO turn ownership: those live in runCreateTurn for the
 * single-pass path and in the loop's fat tools for the compound path, which is
 * exactly why both can share these.
 */

import { createLogger } from '../../../utils/logger.js';

import type { ChatGraphState, CreatedDocument } from '../../../agents/langgraph/ChatGraph/types.js';
import type { CreatePdfResult } from '../../../services/pdf/PdfGenerationService.js';

const log = createLogger('ChatGraphController');

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
 * PDF generation has its own entry point rather than a `runDocGeneration`
 * branch: it produces a finished file plus a verification report, not a
 * collaborative document, so the return shape genuinely differs.
 */
export async function runPdfGeneration(opts: {
  userContent: string;
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  req: Express.Request;
  userId: string;
  pdfOptions?: PdfGenerationOptions;
  onCommit?: () => void;
}): Promise<CreatePdfResult | null> {
  const { userContent, aiWorkerPool, req, userId, onCommit } = opts;
  const reqWithUser = req as Express.Request & { user?: { id?: string }; sessionID?: string };
  const { PDF_GENERATION_PROMPT, parsePdfStructure, validatePdfStructure, createPdfDocument } =
    await import('../../../services/pdf/PdfGenerationService.js');
  const { PDF_DOCUMENT_TOOL_SCHEMA } = await import('../../../services/pdf/pdfDocument.js');
  const { generateStructured, viaLaxParser, withContent } =
    await import('../../../services/ai/generateStructured.js');

  const pdfOptions = opts.pdfOptions ?? {};
  const directive =
    pdfOptions.documentKind === 'letter'
      ? 'Der Nutzer möchte ein offizielles Schreiben mit Briefkopf. Setze "kind":"letter" und fülle das "letter"-Objekt aus.\n\n'
      : pdfOptions.documentKind === 'form'
        ? 'Der Nutzer möchte ein ausfüllbares Formular. Setze "kind":"form" und baue passende field-Blöcke.\n\n'
        : '';

  const generated = await generateStructured({
    aiWorkerPool,
    req: reqWithUser,
    type: 'doc_generation',
    systemPrompt: PDF_GENERATION_PROMPT,
    userContent: `${directive}${userContent}`,
    toolName: 'create_pdf_document',
    toolDescription: 'Erzeugt ein fertiges PDF-Dokument aus Titel und Inhaltsblöcken.',
    schema: PDF_DOCUMENT_TOOL_SCHEMA,
    validate: validatePdfStructure,
    // Providers that ignore tools still answer with JSON text — this was the
    // only path before, kept so none of them can regress.
    parseText: parsePdfStructure,
    temperature: 0.5,
    label: 'pdf',
  });
  if (!generated.ok) {
    log.warn(`[ChatGraph] PDF generation returned no usable structure: ${generated.error}`);
    return null;
  }
  const structure = generated.data;
  onCommit?.();

  // Sender defaults to the profile display name so a letterhead never renders
  // an empty Absender block.
  let sender = pdfOptions.sender ?? null;
  const isLetter = structure.kind === 'letter' || pdfOptions.documentKind === 'letter';
  if (isLetter && !sender?.name && !sender?.organization) {
    const profileName = await resolveSharepicAuthorName(userId);
    if (profileName) sender = { ...sender, name: profileName };
  }

  return createPdfDocument(structure, {
    userId,
    locale: pdfOptions.userLocale === 'de-AT' ? 'de-AT' : 'de-DE',
    sender,
  });
}

export async function runDocGeneration(opts: {
  kind: 'presentation' | 'sheet' | 'document';
  userContent: string;
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  req: Express.Request;
  userId: string;
  /** Invoked ONCE, after the model produced a parseable structure but BEFORE
   *  the DB write. The turn-owning handlers use it to open the stream at the
   *  original commit point (`response_start`) so a create failure still surfaces
   *  the in-stream error rather than falling through; the loop fat tool omits
   *  it (the loop owns the stream). */
  onCommit?: () => void;
}): Promise<CreatedDocument | null> {
  const { kind, userContent, aiWorkerPool, req, userId, onCommit } = opts;
  const reqWithUser = req as Express.Request & { user?: { id?: string }; sessionID?: string };
  const { generateStructured, viaLaxParser, withContent } =
    await import('../../../services/ai/generateStructured.js');

  if (kind === 'presentation') {
    const {
      PRESENTATION_GENERATION_PROMPT,
      PRESENTATION_TOOL_SCHEMA,
      parsePresentationStructure,
      createPresentationDocument,
    } = await import('../../../services/presentations/PresentationGenerationService.js');
    const generated = await generateStructured({
      aiWorkerPool,
      req: reqWithUser,
      type: 'doc_generation',
      systemPrompt: PRESENTATION_GENERATION_PROMPT,
      userContent,
      toolName: 'create_presentation',
      toolDescription: 'Erzeugt die Folienstruktur der Präsentation.',
      schema: PRESENTATION_TOOL_SCHEMA,
      validate: viaLaxParser(parsePresentationStructure, 'title oder slides fehlen'),
      parseText: parsePresentationStructure,
      temperature: 0.4,
      label: 'presentation',
    });
    if (!generated.ok) {
      log.warn(`[ChatGraph] Presentation generation failed: ${generated.error}`);
      return null;
    }
    onCommit?.();
    const doc = await createPresentationDocument(generated.data, userId);
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
    const generated = await generateStructured({
      aiWorkerPool,
      req: reqWithUser,
      type: 'doc_generation',
      systemPrompt: SHEET_GENERATION_PROMPT,
      userContent,
      toolName: 'create_sheet',
      toolDescription: 'Erzeugt die Tabellenstruktur (Blätter, Spalten, Zeilen).',
      schema: SHEET_TOOL_SCHEMA,
      validate: viaLaxParser(parseSheetStructure, 'title oder sheets fehlen'),
      parseText: parseSheetStructure,
      temperature: 0.4,
      label: 'sheet',
    });
    if (!generated.ok) {
      log.warn(`[ChatGraph] Sheet generation failed: ${generated.error}`);
      return null;
    }
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
    parseDocumentResponse,
    createDocumentWithContent,
  } = await import('../../../services/docs/DocGenerationService.js');
  const generated = await generateStructured({
    aiWorkerPool,
    req: reqWithUser,
    type: 'doc_generation',
    systemPrompt: DOCUMENT_GENERATION_PROMPT,
    userContent,
    toolName: 'create_document',
    toolDescription: 'Erzeugt das Dokument als HTML mit Titel und subtype.',
    schema: DOCUMENT_TOOL_SCHEMA,
    validate: viaLaxParser(withContent(parseDocumentResponse), 'content fehlt oder ist leer'),
    parseText: withContent(parseDocumentResponse),
    temperature: 0.7,
    label: 'document',
  });
  if (!generated.ok) {
    log.warn(`[ChatGraph] Document generation failed: ${generated.error}`);
    return null;
  }
  const parsed = generated.data;
  onCommit?.();
  const doc = await createDocumentWithContent(parsed.title, parsed.content, parsed.subtype, userId);
  return {
    documentId: doc.id,
    title: parsed.title,
    subtype: parsed.subtype,
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
  aiWorkerPool: ChatGraphState['aiWorkerPool'];
  req: Express.Request;
  userId: string;
  /** Invoked ONCE after a parseable structure but BEFORE the DB write — same
   *  commit point as runDocGeneration/runPdfGeneration, so the turn handler can
   *  open the stream there instead of eagerly. */
  onCommit?: () => void;
}): Promise<CreatedBoard | null> {
  const { userContent, aiWorkerPool, req, userId, onCommit } = opts;
  const {
    BOARD_GENERATION_PROMPT,
    BOARD_TOOL_SCHEMA,
    createBoardDocument,
    parseBoardStructure,
    postProcessBoardStructure,
  } = await import('../../../services/boards/BoardService.js');
  const { generateStructured, viaLaxParser, withContent } =
    await import('../../../services/ai/generateStructured.js');

  const generated = await generateStructured({
    aiWorkerPool,
    req: req as Express.Request & { user?: { id?: string }; sessionID?: string },
    type: 'board_generation',
    systemPrompt: BOARD_GENERATION_PROMPT,
    userContent,
    toolName: 'create_board',
    toolDescription: 'Erzeugt die Board-Struktur aus Spalten und Aufgabenkarten.',
    schema: BOARD_TOOL_SCHEMA,
    validate: viaLaxParser(parseBoardStructure, 'statusOptions oder rows fehlen'),
    parseText: parseBoardStructure,
    temperature: 0.7,
    label: 'board',
  });
  if (!generated.ok) {
    log.warn(`[ChatGraph] Board generation failed: ${generated.error}`);
    return null;
  }
  const structure = generated.data;
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
