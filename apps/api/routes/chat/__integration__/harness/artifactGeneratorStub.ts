import { vi } from 'vitest';

import { type CreatedBoard } from '../../services/artifactGeneration.js';

import type { CreatedDocument } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { CreatePdfResult } from '../../../../services/pdf/PdfGenerationService.js';

/**
 * Doubles for the three artifact GENERATORS, so a create turn can be driven
 * over the wire.
 *
 * `artifactGeneration.ts` is the single seam that makes all five create paths
 * testable at once: every one of them reaches a model through exactly one of
 * `runDocGeneration` / `runPdfGeneration` / `runBoardGeneration`, and nothing
 * else in the choreography talks to a provider. Stubbing the module's three
 * generators therefore leaves the whole thing under test — the stage dispatch,
 * `runCreateTurn`, the SSE order, the persisted metadata and the sticky
 * artifact pointer — while removing the only part that cannot run here.
 *
 * The pure helpers (`pdfKindFromText`, `documentContextKind`) are deliberately
 * NOT replaced: they are real subjects, and `PDF_SPEC` routes the letter/form
 * layout through the first one. Callers spread the original module and override
 * only the three functions below.
 *
 * `onCommit` is invoked before every successful return, at the same point the
 * real generators call it (parseable structure, before the write). Skipping it
 * would make the stream open eagerly and hide the very ordering the create
 * paths guarantee.
 */

export interface GeneratorControl {
  /** Set to false to exercise the "model produced nothing usable" branch. */
  docOk: boolean;
  pdfOk: boolean;
  boardOk: boolean;
  /** Throw instead of returning null — the `errorText` branch. */
  docThrows: boolean;
  /** Every call, in order, with the brief the generator was handed. */
  calls: Array<{ generator: 'doc' | 'pdf' | 'board'; kind?: string; userContent: string }>;
}

export const generatorControl: GeneratorControl = {
  docOk: true,
  pdfOk: true,
  boardOk: true,
  docThrows: false,
  calls: [],
};

export function resetGeneratorControl(): void {
  generatorControl.docOk = true;
  generatorControl.pdfOk = true;
  generatorControl.boardOk = true;
  generatorControl.docThrows = false;
  generatorControl.calls.length = 0;
}

const SUBTYPE_BY_KIND: Readonly<Record<'presentation' | 'sheet' | 'document', string>> = {
  presentation: 'presentation',
  sheet: 'sheet',
  document: 'text',
};

export const STUB_DOC_ID = 'doc-stub-1';
export const STUB_BOARD_ID = 'board-stub-1';
export const STUB_PDF_ID = 'pdf-stub-1.pdf';

export function artifactGenerationStub(original: Record<string, unknown>): Record<string, unknown> {
  return {
    ...original,
    runDocGeneration: vi.fn(
      (opts: {
        kind: 'presentation' | 'sheet' | 'document';
        userContent: string;
        onCommit?: () => void;
      }): Promise<CreatedDocument | null> => {
        generatorControl.calls.push({
          generator: 'doc',
          kind: opts.kind,
          userContent: opts.userContent,
        });
        if (generatorControl.docThrows) throw new Error('stub: doc generation exploded');
        if (!generatorControl.docOk) return Promise.resolve(null);
        opts.onCommit?.();
        return Promise.resolve({
          documentId: STUB_DOC_ID,
          title: `Stub ${opts.kind}`,
          subtype: SUBTYPE_BY_KIND[opts.kind],
          url: `/docs/${STUB_DOC_ID}`,
        });
      }
    ),
    runPdfGeneration: vi.fn(
      (opts: { userContent: string; onCommit?: () => void }): Promise<CreatePdfResult | null> => {
        generatorControl.calls.push({ generator: 'pdf', userContent: opts.userContent });
        if (!generatorControl.pdfOk) return Promise.resolve(null);
        opts.onCommit?.();
        return Promise.resolve({
          document: {
            documentId: STUB_PDF_ID,
            title: 'Stub PDF',
            subtype: 'pdf',
            url: `/api/compute/assets/${STUB_PDF_ID}`,
          },
          // No problems: the success text branches on this, and a scenario that
          // wants the "Bitte prüfen" wording says so by editing it.
          verification: {
            pages: 1,
            extractedChars: 120,
            hasStructureTree: true,
            isMarkedTagged: true,
            hasLanguage: true,
            hasTitle: true,
            showsTitleInViewer: true,
            hasUaIdentifier: true,
            formFields: [],
            fieldsWithoutLabel: [],
            overflowingText: [],
            problems: [],
          },
          summary: '1 Seite, getaggt, PDF/UA-1',
          spec: {
            title: 'Stub PDF',
            kind: 'document',
            language: 'de-DE',
            blocks: [{ type: 'paragraph', text: 'Stub' }],
          },
        } as CreatePdfResult);
      }
    ),
    runBoardGeneration: vi.fn(
      (opts: { userContent: string; onCommit?: () => void }): Promise<CreatedBoard | null> => {
        generatorControl.calls.push({ generator: 'board', userContent: opts.userContent });
        if (!generatorControl.boardOk) return Promise.resolve(null);
        opts.onCommit?.();
        return Promise.resolve({
          boardId: STUB_BOARD_ID,
          title: 'Stub Board',
          boardGeneratedStructure: { columns: [] },
          columnNames: ['Offen', 'Erledigt'],
          cardCount: 3,
        });
      }
    ),
  };
}
