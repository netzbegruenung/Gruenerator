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

// MathJax v3 on purpose: it converts synchronously with the TeX font compiled
// in (~1.3 MB). v4 loads font ranges asynchronously and ships ~14 MB of them.
// Only `texToSvg.ts` may load this module, and only lazily (see there).

/** Builds the TeX → SVG markup converter. */
export function createTexToSvg(): (tex: string, display: boolean) => string {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document('', {
    InputJax: new TeX({
      packages: ['base', 'ams', 'boldsymbol', 'color', 'mhchem', 'newcommand', 'textmacros'],
    }),
    // 'local': every SVG carries its own glyph <defs>, so each one renders alone.
    OutputJax: new SVG({ fontCache: 'local' }),
  });
  return (tex, display) => {
    // `convert` is typed `any`; with the lite adaptor it returns the
    // <mjx-container> element, whose only child is the <svg>.
    const container = doc.convert(tex, { display }) as LiteElement;
    return adaptor.outerHTML(adaptor.firstChild(container) as LiteElement);
  };
}
