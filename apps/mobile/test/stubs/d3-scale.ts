/**
 * d3-scale stub for the Jest lane — ESM only, see `d3-geo.ts` beside it. A linear scale
 * that always answers the low end of its range; the real ramp is covered in Vitest.
 */
export function scaleLinear<R = string>() {
  let range: R[] = [];
  const scale = Object.assign((_x: number): R => range[0], {
    domain: (_d: number[]) => scale,
    range: (r: R[]) => {
      range = r;
      return scale;
    },
    clamp: (_c: boolean) => scale,
  });
  return scale;
}
