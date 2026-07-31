import {
  type AIRequestData,
  type AIWorkerPool,
  type AIWorkerResult,
} from '../../../../workers/types.js';

type Responder = AIWorkerResult | ((data: AIRequestData) => AIWorkerResult);

export interface AiWorkerStub extends AIWorkerPool {
  /** Queue one or more replies for a request `type`, consumed in order. */
  script: (type: string, ...replies: Responder[]) => void;
  /**
   * Throws when a scripted reply was never consumed. A scripted classifier
   * verdict that nothing asked for means the turn resolved in an earlier
   * heuristic tier — so the test believes it pinned a verdict it never set,
   * and passes having asserted nothing about the path it names.
   */
  assertScriptsConsumed: () => void;
  calls: AIRequestData[];
  reset: () => void;
}

/**
 * `app.locals.aiWorkerPool` is a genuine DI seam (`getAIWorkerPool` reads
 * exactly that), and the classifier plus every other in-graph model call goes
 * through `processRequest` — so scripting VERDICTS here replaces the model
 * without touching the AI SDK at all.
 *
 * An unscripted type THROWS on purpose. The classifier resolves most phrasings
 * in its heuristic tiers without a model call; when a phrasing later drifts
 * into the LLM tier, this stub says so by name instead of quietly attempting a
 * real provider call — which would make the test both slow and machine-
 * dependent, and would silently change what it means.
 */
export function createAiWorkerPoolStub(): AiWorkerStub {
  const queues = new Map<string, Responder[]>();
  const calls: AIRequestData[] = [];

  return {
    calls,
    script(type: string, ...replies: Responder[]): void {
      queues.set(type, [...(queues.get(type) ?? []), ...replies]);
    },
    assertScriptsConsumed(): void {
      const leftover = [...queues.entries()].filter(([, q]) => q.length > 0);
      if (leftover.length > 0) {
        throw new Error(
          `scripted aiWorkerPool replies were never consumed: ` +
            leftover.map(([type, q]) => `${type} (${q.length} left)`).join(', ') +
            ` — the turn resolved before reaching the model, so this test pinned nothing`
        );
      }
    },
    reset(): void {
      queues.clear();
      calls.length = 0;
    },
    processRequest(data: AIRequestData): Promise<AIWorkerResult> {
      calls.push(data);
      const type = String(data.type);
      const queue = queues.get(type);
      if (!queue || queue.length === 0) {
        const seen = calls.filter((c) => String(c.type) === type).length;
        throw new Error(
          `unscripted aiWorkerPool.processRequest type=${type} (call #${seen}); ` +
            `scripted types: ${[...queues.keys()].join(', ') || 'none'}`
        );
      }
      const reply = queue.shift() as Responder;
      return Promise.resolve(typeof reply === 'function' ? reply(data) : reply);
    },
    shutdown(): Promise<void> {
      return Promise.resolve();
    },
  };
}

/**
 * The classifier reads only `response.content`, parsed as JSON. Named rather
 * than inlined with an index signature: the index signature made every caller's
 * narrower literal unassignable under `exactOptionalPropertyTypes`.
 */
export interface ClassifierVerdictInput {
  intent: string;
  secondaryIntent?: string | null;
  searchQuery?: string | null;
  reasoning?: string;
  needsResearch?: boolean;
  needsClarification?: boolean;
}

export function classifierVerdict(verdict: ClassifierVerdictInput): AIWorkerResult {
  return {
    success: true,
    content: JSON.stringify({
      secondaryIntent: null,
      searchQuery: null,
      reasoning: 'integration test verdict',
      needsResearch: false,
      needsClarification: false,
      ...verdict,
    }),
    metadata: { provider: 'stub', timestamp: new Date().toISOString() },
  };
}
