import type { SectionConfig, SectionContext } from '../types';

/**
 * Returns a section definer bound to a template's `TState` / `TActions`.
 *
 * The returned `defineSection` infers `TProps` from the `component` field
 * (anchored via `NoInfer` so `propsFactory`'s return cannot widen it), then
 * verifies `propsFactory` returns the same shape. This regains the
 * compile-time link between component and propsFactory that
 * `SectionConfig<TState, TActions, any>` (in `FullCanvasConfig.sections`)
 * structurally erases — the Record stays heterogeneous, but each definition
 * site gets its own typed slot.
 *
 * **What this catches:** missing required props, wrong prop types
 * (e.g., passing a `number` where the component expects a `string`).
 *
 * **What this does NOT catch:** excess properties / typos in optional
 * fields. This is a TypeScript limitation — excess-property checking only
 * fires for "fresh" object literals at the immediate assignment site, and
 * literals that flow through a generic function parameter lose freshness.
 * Even `NoInfer` can't recover this. To catch excess props you'd need an
 * `Exact<T>` utility type, which is out of scope for this helper.
 *
 * Usage:
 * ```
 * const section = makeSectionDefiner<MyState, MyActions>();
 *
 * const backgroundSection = section({
 *   component: BackgroundSection,
 *   propsFactory: (state, actions) => ({ ... }),  // ← typed against BackgroundSectionProps
 * });
 * ```
 *
 * If `BackgroundSection`'s prop type is later renamed, `propsFactory` here
 * fails to compile — instead of silently passing the wrong shape at runtime.
 */
export function makeSectionDefiner<TState, TActions>() {
  return function defineSection<TProps>(config: {
    component: React.ComponentType<TProps>;
    propsFactory: (state: TState, actions: TActions, context?: SectionContext) => NoInfer<TProps>;
  }): SectionConfig<TState, TActions, TProps> {
    return config;
  };
}
