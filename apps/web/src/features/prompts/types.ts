/**
 * Type definitions for Custom Prompts.
 *
 * Shapes derive from the ts-rest contract (@gruenerator/contracts) — the
 * request/response schema is the single source of truth, don't hand-duplicate
 * it here.
 */
import {
  type CustomPrompt as ContractCustomPrompt,
  type CreateCustomPromptBody,
  type UpdateCustomPromptBody,
} from '@gruenerator/contracts';

export type CustomPrompt = ContractCustomPrompt;

export type CustomPromptCreateData = CreateCustomPromptBody;

export type CustomPromptUpdateData = UpdateCustomPromptBody & { id: string };
