/**
 * Per-template AI capability declaration.
 *
 * A template that wants to expose the AI sidebar tab adds an `ai` field
 * to its FullCanvasConfig. The presence of this field is what enables the
 * AI section — templates without it never render the AI tab.
 *
 * The capability declaration tells the integration:
 *   - which operation kinds the template supports
 *   - how to summarise template state for the AI (`describeForAi`)
 *   - what colour schemes / illustrations / assets the AI may reference
 *   - which (if any) operation kinds need template-specific dispatch
 *     overrides because the default applier path doesn't fit
 *
 * Generic over the operation union `TOp` and the snapshot `TSnapshot`: the
 * core vocabulary from `@ggraphic/schema` by default, a host's composed
 * union and snapshot (core plus its own kinds) when the host binds them.
 * Operation kinds outside the core need an `applyOverrides` entry.
 */
import type { CoreCanvasAiOperation, CoreCanvasAiSnapshot } from '@ggraphic/schema';

/** The outcome of applying one canvas-AI operation. */
export type ApplyResult = { ok: true } | { ok: false; reason: string };

export type CanvasAiNamedOption = { id: string; label: string };

/**
 * Per-operation override invoked by `applyOperation` when present.
 * Receives the validated operation (already narrowed via the union),
 * the template's actions object, and a getState() callback for fresh
 * reads. Returning is fine; throwing surfaces as a per-op apply error.
 */
export type CanvasAiApplyOverride<
  TState,
  TActions,
  K extends TOp['kind'],
  TOp extends { kind: string } = CoreCanvasAiOperation,
> = (op: Extract<TOp, { kind: K }>, actions: TActions, getState: () => TState) => void;

export type CanvasAiApplyOverrides<
  TState,
  TActions,
  TOp extends { kind: string } = CoreCanvasAiOperation,
> = {
  [K in TOp['kind']]?: CanvasAiApplyOverride<TState, TActions, K, TOp>;
};

export interface TemplateAiCapabilities<
  TState = Record<string, unknown>,
  TActions = Record<string, unknown>,
  TOp extends { kind: string } = CoreCanvasAiOperation,
  TSnapshot = CoreCanvasAiSnapshot,
> {
  /** Operation kinds this template supports. AI prompt is filtered to these. */
  supportedOperations: TOp['kind'][];

  /** Pure function: state → AI-readable summary. */
  describeForAi: (state: TState) => TSnapshot;

  /** Available named color schemes (for set-color-scheme). */
  colorSchemes?: CanvasAiNamedOption[];

  /** Available illustration ids the AI can add. */
  illustrations?: CanvasAiNamedOption[];

  /** Available asset ids (`sunflower`, `quote-mark`, …). */
  assets?: CanvasAiNamedOption[];

  /**
   * Per-operation dispatch overrides. Use these when the default applier
   * path (e.g. `actions.setHeadline(value)`) doesn't apply — e.g. for
   * a three-line template's `setLine1/2/3` or presentation's `setColorMode`.
   */
  applyOverrides?: CanvasAiApplyOverrides<TState, TActions, TOp>;

  /**
   * Runs after every op that applied. The state an op handler reads is the
   * one the canvas rendered, not what earlier ops in the batch left, so a
   * check across ops (a bar group bound) has to queue its own
   * state updater from here.
   */
  afterApply?: (op: TOp, actions: TActions) => void;
}
