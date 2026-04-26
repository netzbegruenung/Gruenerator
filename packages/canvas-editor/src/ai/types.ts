/**
 * Per-template AI capability declaration.
 *
 * A template that wants to expose the AI sidebar tab adds an `ai` field
 * to its FullCanvasConfig. The presence of this field is what enables the
 * AI section — templates without it never render the AI tab.
 *
 * The capability declaration tells the integration:
 *   - which CanvasAiOperation kinds the template supports
 *   - how to summarise template state for the AI (`describeForAi`)
 *   - what colour schemes / illustrations / assets the AI may reference
 *   - which (if any) operation kinds need template-specific dispatch
 *     overrides because the default applier path doesn't fit
 */
import type {
  CanvasAiOperation,
  CanvasAiOperationKind,
  CanvasAiSnapshot,
} from '@gruenerator/contracts';

export type CanvasAiNamedOption = { id: string; label: string };

/**
 * Per-operation override invoked by `applyOperation` when present.
 * Receives the validated operation (already narrowed via the union),
 * the template's actions object, and a getState() callback for fresh
 * reads. Returning is fine; throwing surfaces as a per-op apply error.
 */
export type CanvasAiApplyOverride<TState, TActions, K extends CanvasAiOperationKind> = (
  op: Extract<CanvasAiOperation, { kind: K }>,
  actions: TActions,
  getState: () => TState
) => void;

export type CanvasAiApplyOverrides<TState, TActions> = {
  [K in CanvasAiOperationKind]?: CanvasAiApplyOverride<TState, TActions, K>;
};

export interface TemplateAiCapabilities<
  TState = Record<string, unknown>,
  TActions = Record<string, unknown>,
> {
  /** Operation kinds this template supports. AI prompt is filtered to these. */
  supportedOperations: CanvasAiOperationKind[];

  /** Pure function: state → AI-readable summary. */
  describeForAi: (state: TState) => CanvasAiSnapshot;

  /** Available named color schemes (for set-color-scheme). */
  colorSchemes?: CanvasAiNamedOption[];

  /** Available illustration ids the AI can add. */
  illustrations?: CanvasAiNamedOption[];

  /** Available asset ids (`sunflower`, `quote-mark`, …). */
  assets?: CanvasAiNamedOption[];

  /**
   * Per-operation dispatch overrides. Use these when the default applier
   * path (e.g. `actions.setHeadline(value)`) doesn't apply — e.g. for
   * dreizeilen's `setLine1/2/3` or presentation's `setColorMode`.
   */
  applyOverrides?: CanvasAiApplyOverrides<TState, TActions>;
}
