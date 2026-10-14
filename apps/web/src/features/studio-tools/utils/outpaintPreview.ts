export interface FittedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MATCH_TOLERANCE = 0.01;

const parseRatio = (ratio: string): number => {
  const [w, h] = ratio.split(':').map(Number);
  return w / h;
};

/** Where the source image sits (in % of the target frame) when fitted with "contain". */
export function fitInTarget(srcWidth: number, srcHeight: number, targetRatio: string): FittedRect {
  const target = parseRatio(targetRatio);
  const src = srcWidth / srcHeight;
  if (src > target) {
    const height = (100 * target) / src;
    return { left: 0, top: (100 - height) / 2, width: 100, height };
  }
  const width = (100 * src) / target;
  return { left: (100 - width) / 2, top: 0, width, height: 100 };
}

export function matchesRatio(srcWidth: number, srcHeight: number, targetRatio: string): boolean {
  const target = parseRatio(targetRatio);
  return Math.abs(srcWidth / srcHeight - target) / target < MATCH_TOLERANCE;
}
