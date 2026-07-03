import { useEffect, useState } from 'react';

// beautiful-mermaid is a lightweight, pure-TS SVG renderer (ELK.js layout, no full
// mermaid/d3 bundle). It is lazy-imported so it stays out of the initial chat chunk and
// only loads when a diagram actually appears.
//
// Colors are passed as CSS-variable strings, so the browser resolves them at paint time
// and diagrams re-theme on light/dark toggle with no re-render. The diagram renders inside
// ChatCodeBlock's always-dark `bg-code-block-bg` container, so it is themed against the
// code-block tokens; `transparent: true` lets that background show through.
const MERMAID_THEME = {
  bg: 'var(--color-code-block-bg)',
  fg: 'var(--color-code-block-fg)',
  muted: 'var(--color-muted-foreground)',
  border: 'var(--color-border)',
  accent: 'var(--color-code-block-fg)',
  transparent: true,
} as const;

/**
 * Renders a ```mermaid code block as an SVG diagram. While a message is still
 * streaming the code is often syntactically incomplete, so rendering is
 * debounced and a parse error keeps the last good render (or the raw code until
 * the first valid one) — nothing ever crashes or flickers to raw mid-stream.
 *
 * beautiful-mermaid supports flowchart, state, sequence, class, ER and XY-chart
 * diagrams; unsupported types throw and fall back to the raw code block.
 */
export function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      import('beautiful-mermaid')
        .then(({ renderMermaidSVG }) => {
          const rendered = renderMermaidSVG(code, MERMAID_THEME);
          if (active) setSvg(rendered);
        })
        .catch(() => {
          /* keep the last good render; raw code shows until the first valid one */
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [code]);

  if (svg) {
    return (
      <div
        className="flex justify-center overflow-x-auto p-4"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <pre className="overflow-x-auto p-4 text-sm text-code-block-fg">
      <code>{code}</code>
    </pre>
  );
}
