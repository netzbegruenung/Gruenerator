import { parse, type JsxAST } from 'react-native-svg';

import { type createTexToSvg } from './mathjaxSvg';

export interface MathSvg {
  ast: JsxAST;
  /** Size in em — multiply by the font size. */
  width: number;
  height: number;
}

let toSvg: ((tex: string, display: boolean) => string) | null = null;
let loadFailed = false;

/** The MathJax converter, or `null` when MathJax cannot load. */
function converter() {
  if (!toSvg && !loadFailed) {
    // Loaded on the first formula, not with the chat screen: evaluating the
    // MathJax modules costs ~85 ms of JS on the first chat open (Hermes
    // profile, production bundle), which threads without math never need.
    // A load error must not take the chat screen down with it; formulas then
    // show as TeX source.
    try {
      const mathjaxSvg = withBrowserNavigatorFields(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./mathjaxSvg') as { createTexToSvg: typeof createTexToSvg }
      );
      toSvg = mathjaxSvg.createTexToSvg();
    } catch (err) {
      loadFailed = true;
      console.error('[math] MathJax failed to load:', err);
    }
  }
  return toSvg;
}

/**
 * MathJax 4 takes any global `window` with a `navigator` for a browser and
 * calls `navigator.appVersion.includes(…)` while its modules load
 * (`@mathjax/src` `util/context.ts`). React Native defines both, but its
 * `navigator` is only `{ product: 'ReactNative' }`, so loading throws. Fill
 * in empty strings for the load and remove them again afterwards
 * (mathjax/MathJax#3616).
 */
function withBrowserNavigatorFields<T>(load: () => T): T {
  // RN types `navigator` as the browser's Navigator, which it is not at runtime.
  const nav = globalThis.navigator as unknown as Record<string, unknown> | undefined;
  if (!nav) return load();
  const added = (['appVersion', 'userAgent'] as const).filter((key) => nav[key] === undefined);
  for (const key of added) nav[key] = '';
  try {
    return load();
  } finally {
    for (const key of added) delete nav[key];
  }
}

const VIEW_BOX_RE = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/;
const CACHE_LIMIT = 500;
const cache = new Map<string, MathSvg | null>();

/**
 * TeX → parsed SVG for `react-native-svg`, or `null` when MathJax rejects the
 * TeX or cannot load. Cached, because list rows remount while scrolling.
 */
export function texToSvg(tex: string, display: boolean): MathSvg | null {
  const key = `${display ? 'd' : 'i'}:${tex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const result = convertTex(tex, display);
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}

function convertTex(tex: string, display: boolean): MathSvg | null {
  const convert = converter();
  if (!convert) return null;
  // The root's CSS `vertical-align` means nothing to a native view.
  const xml = convert(tex, display).replace(/^<svg style="[^"]*"/, '<svg');
  if (xml.includes('data-mjx-error')) return null;
  const box = VIEW_BOX_RE.exec(xml);
  const ast = parse(xml);
  if (!box || !ast) return null;
  // MathJax draws at 1000 units per em.
  return { ast, width: Number(box[1]) / 1000, height: Number(box[2]) / 1000 };
}
