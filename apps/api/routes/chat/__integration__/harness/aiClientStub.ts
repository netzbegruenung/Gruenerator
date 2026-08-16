import { type AIRequestData, type AiClient, type AiResult } from '../../../../services/ai/types.js';

type Responder = AiResult | ((data: AIRequestData) => AiResult);

export interface AiClientStub extends AiClient {
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
 * `app.locals.aiClient` is a genuine DI seam (`getAiClient` reads exactly
 * that) — but it is no longer the only door. Call sites are moving onto the
 * typed facade, which reaches `executeProvider` directly and never looks at
 * `app.locals`; `executeProviderStub` above routes that door into this same
 * script, so a scripted VERDICT still replaces the model whichever way the
 * call site asks.
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

/**
 * The stub the facade's door hands to. Set by `createAiClientStub`, read by
 * `executeProviderStub` — one per suite, and a suite has one stub.
 */
let active: AiClientStub | null = null;

/**
 * The OTHER door, and the reason this file is no longer enough on its own.
 *
 * `aiText`/`aiObject`/`aiTools` never touch `app.locals.aiClient`; they call
 * `executeProvider` directly. As call sites move onto the facade, scripting
 * only `processRequest` stops covering them — silently: the classifier's
 * resolvers then attempt a REAL provider, fail for want of an API key, and
 * fall through to a heuristic tier, so the test asserts a path it never took.
 *
 * Integration files mock `services/ai/execution/index.js` with this, which
 * routes both doors into the same script.
 */
export function executeProviderStub(
  _provider: string,
  _requestId: string,
  data: AIRequestData
): Promise<AiResult> {
  if (!active) {
    throw new Error('executeProviderStub: no aiClient stub has been created for this suite');
  }
  return active.processRequest(data);
}

export function createAiClientStub(): AiClientStub {
  const queues = new Map<string, Responder[]>();
  const resolverQueues = new Map<string, string[]>();
  const calls: AIRequestData[] = [];

  const stub: AiClientStub = {
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
          `scripted aiClient replies were never consumed: ` +
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
    processRequest(data: AIRequestData): Promise<AiResult> {
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
        return Promise.resolve({ content: scripted ?? resolver.reply } as AiResult);
      }
      const queue = queues.get(type);
      if (!queue || queue.length === 0) {
        const seen = calls.filter((c) => String(c.type) === type).length;
        throw new Error(
          `unscripted aiClient.processRequest type=${type} (call #${seen}); ` +
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

  active = stub;
  return stub;
}
