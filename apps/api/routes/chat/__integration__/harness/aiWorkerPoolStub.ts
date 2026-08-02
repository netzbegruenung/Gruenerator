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
   * Queue a reply for ONE small resolver, matched by its system-prompt prefix.
   *
   * The only way left to put a chosen verdict into a turn: with the LLM tier
   * deleted, every model-answered classifier decision comes from a resolver with
   * a closed answer space, and those are matched by prompt rather than by
   * request type (they all share `chat_intent_classification`). Scripting by
   * type would hand the reply to whichever resolver runs first.
   */
  scriptResolver: (prefix: string, ...replies: string[]) => void;
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
/**
 * The small, single-question resolvers that run on the way to the LLM tier,
 * matched by the opening words of their system prompt, each answered with the
 * value that means "I have no opinion, carry on".
 *
 * Only the resolvers that run on EVERY such turn are listed. The ones with a
 * narrow trigger (the docs tiebreak, the forced-search query refiner) are left
 * out on purpose: they fire only where a scenario put them, and there a
 * scripted reply is the point.
 */
const RESOLVER_DEFAULTS: ReadonlyArray<{ prefix: string; reply: string }> = [
  // sourceScopeResolver — no live source needed
  { prefix: 'Entscheide, ob diese Anfrage Daten', reply: 'keine' },
  // editTargetResolver — the follow-up targets none of the thread's artifacts
  { prefix: 'Ein Gespräch hat mehrere Artefakte', reply: '0' },
  { prefix: 'Entscheide, ob diese Nachricht ein ARTEFAKT', reply: 'keine' },
];

export function createAiWorkerPoolStub(): AiWorkerStub {
  const queues = new Map<string, Responder[]>();
  const resolverQueues = new Map<string, string[]>();
  const calls: AIRequestData[] = [];

  return {
    calls,
    script(type: string, ...replies: Responder[]): void {
      queues.set(type, [...(queues.get(type) ?? []), ...replies]);
    },
    scriptResolver(prefix: string, ...replies: string[]): void {
      resolverQueues.set(prefix, [...(resolverQueues.get(prefix) ?? []), ...replies]);
    },
    assertScriptsConsumed(): void {
      const leftover = [
        ...[...queues.entries()].filter(([, q]) => q.length > 0),
        ...[...resolverQueues.entries()].filter(([, q]) => q.length > 0),
      ];
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
      resolverQueues.clear();
      calls.length = 0;
    },
    processRequest(data: AIRequestData): Promise<AIWorkerResult> {
      calls.push(data);
      const type = String(data.type);
      // The small resolvers all share the `chat_intent_classification` type, so
      // they are matched by their prompt instead — first from whatever the
      // scenario scripted for that specific resolver, otherwise with "no
      // opinion", the fail-safe every resolver already treats as "carry on to
      // the next tier".
      //
      // They must NOT draw from the type queue: several of them can run in one
      // turn, and the first to be asked would swallow a reply meant for another.
      const resolver = RESOLVER_DEFAULTS.find((r) => data.systemPrompt?.startsWith(r.prefix));
      if (resolver) {
        const scripted = resolverQueues.get(resolver.prefix)?.shift();
        return Promise.resolve({ content: scripted ?? resolver.reply } as AIWorkerResult);
      }
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
