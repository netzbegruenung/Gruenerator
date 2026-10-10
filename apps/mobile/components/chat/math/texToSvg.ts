import { parse, type JsxAST } from 'react-native-svg';

import { type createTexToSvg } from './mathjaxSvg';

export interface MathSvg {
  ast: JsxAST;
  /** Size in em — multiply by the font size. */
  width: number;
  height: number;
}

let toSvg: ((tex: string, display: boolean) => string) | null = null;

function converter() {
  if (!toSvg) {
    // Loaded on the first formula, not with the chat screen: evaluating the
    // MathJax modules costs ~85 ms of JS on the first chat open (Hermes
    // profile, production bundle), which threads without math never need.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mathjaxSvg = require('./mathjaxSvg') as { createTexToSvg: typeof createTexToSvg };
    toSvg = mathjaxSvg.createTexToSvg();
  }
  return toSvg;
}

const VIEW_BOX_RE = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/;
const CACHE_LIMIT = 500;
const cache = new Map<string, MathSvg | null>();

/**
 * TeX → parsed SVG for `react-native-svg`, or `null` when MathJax rejects the
 * TeX. Cached, because list rows remount while scrolling.
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
  // The root's CSS `vertical-align` means nothing to a native view.
  const xml = converter()(tex, display).replace(/^<svg style="[^"]*"/, '<svg');
  if (xml.includes('data-mjx-error')) return null;
  const box = VIEW_BOX_RE.exec(xml);
  const ast = parse(xml);
  if (!box || !ast) return null;
  // MathJax draws at 1000 units per em.
  return { ast, width: Number(box[1]) / 1000, height: Number(box[2]) / 1000 };
}
