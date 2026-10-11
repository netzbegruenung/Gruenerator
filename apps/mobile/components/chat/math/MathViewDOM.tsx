'use dom';

import 'katex/dist/katex.min.css';
// Registers \ce / \pu chemistry macros on the shared katex module (parity with
// web's lazy loader in packages/chat/src/lib/katexCss.ts).
import 'katex/contrib/mhchem';
import { type DOMProps } from 'expo/dom';
import renderMathInElement from 'katex/contrib/auto-render';
import { useEffect, useRef } from 'react';

interface MathViewDOMProps {
  /** Prose with $…$ spans; display blocks are drawn natively (`MathText`). */
  content: string;
  textColor: string;
  fontSize: number;
  dom?: DOMProps;
}

/**
 * KaTeX renderer hosted in an Expo DOM component (WebView). KaTeX JS + CSS +
 * fonts are bundled locally by Metro — no CDN. The native host sizes the
 * WebView to the content via `dom={{ matchContents: true }}`.
 */
export default function MathViewDOM({ content, textColor, fontSize }: MathViewDOMProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // textContent assignment = built-in HTML escaping; auto-render then
    // replaces the $…$/$$…$$ spans in place.
    el.textContent = content;
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  }, [content]);

  return (
    <div
      ref={ref}
      style={{
        color: textColor,
        fontSize,
        lineHeight: 1.55,
        margin: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    />
  );
}
