import { type BoardFlowCardContext } from '@gruenerator/contracts';

import { type AgentTask } from '../../../../database/schema/agentTasks.js';

/**
 * Context handed to each output executor. `documentUrl`/`documentId` are populated
 * once the document node has run, so the comment/email nodes can link to it.
 */
export interface OutputRunContext {
  task: AgentTask;
  content: string;
  title: string;
  cardContext: BoardFlowCardContext;
  documentUrl: string | null;
  documentId: string | null;
}

/** An executor may return a patch (currently only the document node does). */
export type OutputPatch = { documentUrl?: string | null; documentId?: string | null };

export type OutputExecutor = (ctx: OutputRunContext) => Promise<OutputPatch | void>;
