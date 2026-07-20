/**
 * Stage 3 output registry. One executor per output type, keyed by the contract's
 * union literal (exhaustive). Outputs run in a fixed order so the document node
 * runs before comment/email, which then link to the created document.
 */
import {
  type BoardFlowCardContext,
  type BoardFlowOutput,
  type BoardFlowOutputType,
} from '@gruenerator/contracts';

import { type AgentTask } from '../../../../database/schema/agentTasks.js';

import { commentOutput } from './commentOutput.js';
import { documentOutput } from './documentOutput.js';
import { emailOutput } from './emailOutput.js';
import { presentationOutput } from './presentationOutput.js';
import { sheetOutput } from './sheetOutput.js';
import { type OutputExecutor } from './types.js';

const OUTPUT_EXECUTORS: Record<BoardFlowOutputType, OutputExecutor> = {
  comment: commentOutput,
  document: documentOutput,
  sheet: sheetOutput,
  presentation: presentationOutput,
  email: emailOutput,
};

// Artifact producers first so comment/email can link to the created doc. If more
// than one artifact is selected, the last one wins for the comment/email link and
// the returned documentId (v1 limitation — all artifacts are still created/linked).
const OUTPUT_ORDER: BoardFlowOutputType[] = [
  'document',
  'sheet',
  'presentation',
  'comment',
  'email',
];

export interface ExecuteOutputsResult {
  documentId: string | null;
}

/** Run the selected output nodes in order; returns the created document id (if any). */
export async function executeOutputs(
  outputs: ReadonlyArray<BoardFlowOutput>,
  base: { task: AgentTask; content: string; title: string; cardContext: BoardFlowCardContext }
): Promise<ExecuteOutputsResult> {
  const selected = new Set(outputs.map((o) => o.type));
  let documentUrl: string | null = null;
  let documentId: string | null = null;

  for (const type of OUTPUT_ORDER) {
    if (!selected.has(type)) continue;
    const patch = await OUTPUT_EXECUTORS[type]({ ...base, documentUrl, documentId });
    if (patch) {
      if (patch.documentUrl !== undefined) documentUrl = patch.documentUrl;
      if (patch.documentId !== undefined) documentId = patch.documentId;
    }
  }

  return { documentId };
}
