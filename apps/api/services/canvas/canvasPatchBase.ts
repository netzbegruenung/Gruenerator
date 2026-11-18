/** The entries of `state` for the keys of `patch`: the base of a patch computed from `state`. */
export function baseForPatch(
  state: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) if (state[key] !== undefined) base[key] = state[key];
  return base;
}
