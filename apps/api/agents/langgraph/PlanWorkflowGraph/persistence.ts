/**
 * PlanWorkflowGraph State Persistence
 * Store and retrieve workflow state from Redis
 */

import { redisClient } from '../../../utils/redis/client.js';
import type { PlanWorkflowState } from './types.js';

const WORKFLOW_STATE_TTL = 86400; // 24 hours
const WORKFLOW_STATE_PREFIX = 'plan_workflow_state:';

/**
 * Strip non-serializable objects from state before saving
 */
function serializableState(state: any): any {
  const { input, ...restState } = state;

  // Extract only serializable parts of input
  const serializableInput = input
    ? {
        inhalt: input.inhalt,
        gliederung: input.gliederung,
        generatorType: input.generatorType,
        subType: input.subType,
        locale: input.locale,
        useWebSearch: input.useWebSearch,
        usePrivacyMode: input.usePrivacyMode,
        useProMode: input.useProMode,
        selectedDocumentIds: input.selectedDocumentIds,
        selectedTextIds: input.selectedTextIds,
        customPrompt: input.customPrompt,
        platforms: input.platforms,
        userId: input.userId,
        workflowId: input.workflowId,
        userAnswers: input.userAnswers,
      }
    : undefined;

  return {
    ...restState,
    input: serializableInput,
  };
}

/**
 * Store workflow state in Redis
 */
export async function saveWorkflowState(workflowId: string, state: any): Promise<void> {
  const key = `${WORKFLOW_STATE_PREFIX}${workflowId}`;

  const cleanState = serializableState(state);

  await redisClient.setEx(key, WORKFLOW_STATE_TTL, JSON.stringify(cleanState));
}

/**
 * Retrieve workflow state from Redis
 */
export async function getWorkflowState(workflowId: string): Promise<any | null> {
  const key = `${WORKFLOW_STATE_PREFIX}${workflowId}`;

  const stateJson = await redisClient.get(key);

  if (!stateJson || typeof stateJson !== 'string') {
    return null;
  }

  return JSON.parse(stateJson);
}

/**
 * Delete workflow state from Redis
 */
export async function deleteWorkflowState(workflowId: string): Promise<void> {
  const key = `${WORKFLOW_STATE_PREFIX}${workflowId}`;

  await redisClient.del(key);
}

/**
 * Update workflow state (partial update)
 */
export async function updateWorkflowState(
  workflowId: string,
  updates: Partial<any>
): Promise<void> {
  const currentState = await getWorkflowState(workflowId);

  if (!currentState) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const updatedState = {
    ...currentState,
    ...updates,
  };

  await saveWorkflowState(workflowId, updatedState);
}

/**
 * Check if workflow state exists
 */
export async function workflowStateExists(workflowId: string): Promise<boolean> {
  const key = `${WORKFLOW_STATE_PREFIX}${workflowId}`;
  const exists = await redisClient.exists(key);
  return exists === 1;
}
