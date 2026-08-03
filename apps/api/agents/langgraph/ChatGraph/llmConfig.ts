/**
 * Re-export shim for the intermediate-lane registry, used by the ChatGraph
 * nodes (classifier, briefGenerator, qualityGate, computeVerifier, summarize, …).
 *
 * This file used to also build LangChain-compatible `ChatMistralAI` instances
 * for `createReactAgent`. That had zero callers — the chat system runs on AI SDK
 * models throughout — and it was the sole reason `@langchain/mistralai` was a
 * dependency, so both are gone. The `MODEL_MAP` alias table went with it; model
 * aliasing lives in `services/ai/providers.ts` and
 * `routes/chat/agents/providers.ts`.
 *
 * It used to re-export a single `INTERMEDIATE_MODEL` constant. That constant is
 * gone: every node now names the STAGE its work belongs to
 * (`intermediateLane('standard')`, `intermediateLane('heavy')`, …), because one
 * shared pair is what put a thread title and `computeNode` on the same model.
 * See `services/ai/intermediateLanes.ts` for the table and the measurements.
 */

export {
  intermediateLane,
  type IntermediateLaneId,
} from '../../../services/ai/intermediateLanes.js';
