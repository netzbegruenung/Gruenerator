import { MathJaxMhchemFontExtension } from '@mathjax/mathjax-mhchem-font-extension/cjs/svg.js';
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/cjs/svg.js';
import { type LiteElement } from '@mathjax/src/cjs/adaptors/lite/Element.js';
import { liteAdaptor } from '@mathjax/src/cjs/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/cjs/handlers/html.js';
import { TeX } from '@mathjax/src/cjs/input/tex.js';
import '@mathjax/src/cjs/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/cjs/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/cjs/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/cjs/input/tex/mhchem/MhchemConfiguration.js';
import '@mathjax/src/cjs/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/cjs/input/tex/textmacros/TextMacrosConfiguration.js';
import { mathjax } from '@mathjax/src/cjs/mathjax.js';
import { SVG } from '@mathjax/src/cjs/output/svg.js';

// The TeX font, not v4's default New Computer Modern: that one loads glyph
// ranges asynchronously, and this conversion runs synchronously during render.
// Preloaded packages do not pull in their font extensions, so mhchem's arrows
// need theirs registered by hand (mathjax/MathJax#3424).
// The `cjs/` paths are deliberate: through the `js/*` export Metro picks the
// ESM build, whose `#…` subpath imports it does not resolve. The CommonJS
// build carries its own `imports` map, which it does.
// Only `texToSvg.ts` may load this module, and only lazily (see there).
MathJaxTexFont.addExtension(MathJaxMhchemFontExtension);

/** Builds the TeX → SVG markup converter. */
export function createTexToSvg(): (tex: string, display: boolean) => string {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document('', {
    InputJax: new TeX({
      packages: ['base', 'ams', 'boldsymbol', 'color', 'mhchem', 'newcommand', 'textmacros'],
    }),
    // 'local': every SVG carries its own glyph <defs>, so each one renders alone.
    OutputJax: new SVG({ fontCache: 'local', fontData: MathJaxTexFont }),
  });
  return (tex, display) => {
    // `convert` is typed `any`; with the lite adaptor it returns the
    // <mjx-container> element, whose only child is the <svg>.
    const container = doc.convert(tex, { display }) as LiteElement;
    // XML, not `outerHTML`: HTML leaves `<` unescaped in attributes such as
    // `data-latex="a < b"`. react-native-svg's parser tolerates that, strict
    // XML parsers do not (mathjax/MathJax#3549).
    return adaptor.serializeXML(adaptor.firstChild(container) as LiteElement);
  };
}
