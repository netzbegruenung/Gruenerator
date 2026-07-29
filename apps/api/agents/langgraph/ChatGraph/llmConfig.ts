/**
 * Re-export shim for the model used by every intermediate/agent processing step
 * (classifier, briefGenerator, qualityGate, computeVerifier, summarize, …).
 *
 * This file used to also build LangChain-compatible `ChatMistralAI` instances
 * for `createReactAgent`. That had zero callers — the chat system runs on AI SDK
 * models throughout — and it was the sole reason `@langchain/mistralai` was a
 * dependency, so both are gone. The `MODEL_MAP` alias table went with it; model
 * aliasing lives in `services/ai/providers.ts` and
 * `routes/chat/agents/providers.ts`.
 *
 * Seven modules import `INTERMEDIATE_MODEL` from here, which is why the shim
 * stays rather than every importer being repointed in the same change.
 */

export { INTERMEDIATE_MODEL } from '../../../services/ai/providers.js';
