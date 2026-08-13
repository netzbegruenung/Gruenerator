/**
 * What differs per artifact kind — everything else lives in runCreateTurn.
 *
 * Adding a kind means adding an entry here; TypeScript then demands every field
 * that the choreography needs. Previously it meant copying an 86-line handler
 * and hoping nothing was missed, which is how four separate instances of the
 * same fall-through bug accumulated.
 */

import {
  documentContextKind,
  pdfKindFromText,
  runBoardGeneration,
  runDocGeneration,
  runPdfGeneration,
} from './artifactGeneration.js';

import type { CreatedBoard } from './artifactGeneration.js';
import type { ArtifactSpec } from './createTurn.js';
import type { CreatedDocument } from '../../../agents/langgraph/ChatGraph/types.js';
import type { CreatePdfResult } from '../../../services/pdf/PdfGenerationService.js';

export const SHEET_SPEC: ArtifactSpec<CreatedDocument> = {
  intent: 'create_sheet',
  progressMessage: 'Erstelle Tabelle...',
  failureText:
    'Ich konnte die Tabelle nicht erstellen. Sag mir kurz, welche Spalten und Daten sie enthalten soll, dann baue ich sie direkt.',
  errorText:
    'Die Tabelle konnte nicht erstellt werden. Versuch es bitte noch einmal mit einer kurzen Beschreibung der gewünschten Spalten.',
  contextKind: 'sheet',
  logLabel: 'Sheet',
  generate: (ctx, onCommit) => runDocGeneration({ kind: 'sheet', ...ctx, onCommit }),
  successText: (doc) => `Tabelle **"${doc.title}"** wurde erstellt.`,
  card: (doc) => doc,
  doneExtras: (doc) => ({ documentId: doc.documentId }),
  persistMetadata: (doc) => ({ intent: 'create_sheet', createdDocument: doc }),
  ref: (doc) => ({ ref: doc.documentId, label: doc.title }),
};

export const PRESENTATION_SPEC: ArtifactSpec<CreatedDocument> = {
  intent: 'create_presentation',
  progressMessage: 'Erstelle Präsentation...',
  failureText:
    'Ich konnte die Präsentation nicht erstellen. Sag mir kurz, welche Folien sie enthalten soll, dann baue ich sie direkt.',
  errorText:
    'Die Präsentation konnte nicht erstellt werden. Versuch es bitte noch einmal mit einer kurzen Beschreibung der gewünschten Folien.',
  contextKind: 'presentation',
  logLabel: 'Presentation',
  generate: (ctx, onCommit) => runDocGeneration({ kind: 'presentation', ...ctx, onCommit }),
  successText: (doc) => `Präsentation **"${doc.title}"** wurde erstellt.`,
  card: (doc) => doc,
  doneExtras: (doc) => ({ documentId: doc.documentId }),
  persistMetadata: (doc) => ({ intent: 'create_presentation', createdDocument: doc }),
  ref: (doc) => ({ ref: doc.documentId, label: doc.title }),
};

export const PDF_SPEC: ArtifactSpec<CreatePdfResult> = {
  intent: 'create_pdf',
  progressMessage: 'Erstelle PDF...',
  failureText:
    'Ich konnte das PDF nicht erzeugen — die gelieferte Struktur war unvollständig. Sag mir kurz, was rein soll (Titel + Inhalte), dann baue ich es direkt.',
  errorText:
    'Das PDF konnte nicht erstellt werden. Versuch es bitte noch einmal mit einer kurzen Beschreibung des gewünschten Inhalts.',
  // 'pdf' is its own kind because the ref is an asset FILE NAME, not a
  // collaborative-document UUID — no doc-edit gate may dereference it.
  contextKind: 'pdf',
  logLabel: 'PDF',
  generate: (ctx, onCommit) =>
    runPdfGeneration({
      userContent: ctx.userContent,
      aiWorkerPool: ctx.aiWorkerPool,
      req: ctx.req,
      userId: ctx.userId,
      pdfOptions: {
        documentKind: pdfKindFromText(ctx.userContent),
        userLocale: ctx.userLocale ?? 'de-DE',
      },
      onCommit,
    }),
  // Reports what the self-check found instead of a blanket success claim.
  successText: (result) =>
    result.verification.problems.length
      ? `PDF **"${result.document.title}"** wurde erstellt (${result.summary}).\n\nBitte prüfen: ${result.verification.problems.join(' ')}`
      : `PDF **"${result.document.title}"** wurde erstellt — ${result.summary}.`,
  card: (result) => result.document,
  doneExtras: (result) => ({ documentId: result.document.documentId }),
  // `pdfSpec` is what makes a PDF editable at all: the artefact is immutable
  // bytes under an asset file name, so a later "ändere das PDF" re-renders from
  // this spec instead of re-guessing the document from the transcript.
  persistMetadata: (result) => ({
    intent: 'create_pdf',
    createdDocument: result.document,
    pdfSpec: result.spec,
  }),
  ref: (result) => ({ ref: result.document.documentId, label: result.document.title }),
};

export const BOARD_SPEC: ArtifactSpec<CreatedBoard> = {
  intent: 'create_board',
  // Boards predate the create_* intents and report 'direct' on success; kept
  // so the unification stays a pure refactor.
  doneIntent: 'direct',
  progressMessage: 'Erstelle Board...',
  failureText:
    'Ich konnte das Board nicht erstellen. Sag mir kurz, welche Spalten und Aufgaben es enthalten soll, dann baue ich es direkt.',
  errorText:
    'Das Board konnte nicht erstellt werden. Versuch es bitte noch einmal mit einer kurzen Beschreibung der gewünschten Spalten.',
  contextKind: 'board',
  logLabel: 'Board',
  generate: (ctx, onCommit) =>
    runBoardGeneration({
      userContent: ctx.userContent,
      aiWorkerPool: ctx.aiWorkerPool,
      req: ctx.req,
      userId: ctx.userId,
      onCommit,
    }),
  successText: (board) =>
    `Board **"${board.title}"** wurde erstellt!\n\n` +
    `**Spalten:** ${board.columnNames.join(', ')}\n` +
    `**Karten:** ${board.cardCount} Aufgaben\n\n` +
    `[Board öffnen](/boards/${board.boardId})`,
  // No `card`: boards have no document_created path — the client seeds Yjs from
  // the done payload below.
  doneExtras: (board) => ({
    boardId: board.boardId,
    boardGeneratedStructure: board.boardGeneratedStructure,
  }),
  // No persistMetadata: the board turn stores plain text today.
  ref: (board) => ({ ref: board.boardId, label: board.title }),
};

/**
 * The document spec is built per call: `intent` and `subtypeOverride` come from
 * the caller (@dokument-erstellen vs. save_as_doc), so unlike the other four
 * this one cannot be a constant.
 */
export function makeDocumentSpec(opts: {
  intent: string;
  subtypeOverride?: string | null;
  conversationContext?: string;
}): ArtifactSpec<CreatedDocument> {
  return {
    intent: opts.intent,
    progressMessage: 'Erstelle Dokument...',
    failureText:
      'Ich konnte das Dokument nicht erstellen. Sag mir kurz, was drinstehen soll, dann schreibe ich es direkt.',
    errorText:
      'Das Dokument konnte nicht erstellt werden. Versuch es bitte noch einmal mit einer kurzen Beschreibung des Inhalts.',
    // A generated "document" may turn out to be a presentation or a sheet.
    contextKind: (doc) => documentContextKind(doc.subtype),
    logLabel: 'Document',
    generate: (ctx, onCommit) =>
      runDocGeneration({
        kind: 'document',
        aiWorkerPool: ctx.aiWorkerPool,
        req: ctx.req,
        userId: ctx.userId,
        userContent: ctx.userContent,
        subtypeOverride: opts.subtypeOverride ?? null,
        ...(opts.conversationContext != null && {
          conversationContext: opts.conversationContext,
        }),
        onCommit,
      }),
    successText: (doc) => `Dokument **"${doc.title}"** wurde erstellt.`,
    card: (doc) => doc,
    doneExtras: (doc) => ({ documentId: doc.documentId }),
    persistMetadata: (doc) => ({ intent: opts.intent, createdDocument: doc }),
    ref: (doc) => ({ ref: doc.documentId, label: doc.title }),
  };
}
