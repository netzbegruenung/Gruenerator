/**
 * d3-geo stub for the Jest lane.
 *
 * d3-geo 3 ships ESM only (`"type": "module"`, a `.mjs` entry), which Jest 30 on Node 22
 * cannot load and jest-expo's `transformIgnorePatterns` cannot be made to transform (see
 * CLAUDE-testing.md). `@gruenerator/shared/monitor` re-exports `choropleth.ts`, so every
 * test that reaches the monitor helpers would die on "Must use import to load ES Module".
 *
 * The stub gives each feature a fixed square path and a fixed area; the real projection
 * and path maths run in `packages/shared/src/monitor/choropleth.vitest.ts`, where Vitest
 * loads the true d3-geo.
 */
export function geoMercator() {
  const proj = Object.assign((_coords: [number, number]): [number, number] => [190, 235], {
    fitSize: () => proj,
  });
  return proj;
}

export function geoPath(_projection?: unknown) {
  return Object.assign((_feature: unknown): string => 'M10 10L60 10L60 60L10 60Z', {
    area: (_feature: unknown): number => 1000,
    centroid: (_feature: unknown): [number, number] => [35, 35],
  });
}
