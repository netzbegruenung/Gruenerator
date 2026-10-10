import { type LiteElement } from 'mathjax-full/js/adaptors/lite/Element.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js';
import 'mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { parse, type JsxAST } from 'react-native-svg';

// MathJax v3 on purpose: it converts synchronously with the TeX font compiled
// in (~1.3 MB). v4 loads font ranges asynchronously and ships ~14 MB of them.

export interface MathSvg {
  ast: JsxAST;
  /** Size in em — multiply by the font size. */
  width: number;
  height: number;
}

let toSvg: ((tex: string, display: boolean) => string) | null = null;

function converter() {
  if (toSvg) return toSvg;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document('', {
    InputJax: new TeX({
      packages: ['base', 'ams', 'boldsymbol', 'color', 'mhchem', 'newcommand', 'textmacros'],
    }),
    // 'local': every SVG carries its own glyph <defs>, so each one renders alone.
    OutputJax: new SVG({ fontCache: 'local' }),
  });
  toSvg = (tex, display) => {
    // `convert` is typed `any`; with the lite adaptor it returns the
    // <mjx-container> element, whose only child is the <svg>.
    const container = doc.convert(tex, { display }) as LiteElement;
    return adaptor.outerHTML(adaptor.firstChild(container) as LiteElement);
  };
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
