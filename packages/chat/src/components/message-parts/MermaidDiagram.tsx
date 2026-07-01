import { useEffect, useId, useState } from 'react';

// Mermaid is heavy (~500kb) and only needed when a diagram actually appears, so
// it is lazy-imported and initialized once on first use.
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid(dark: boolean): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: dark ? 'dark' : 'default',
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

/**
 * Renders a ```mermaid code block as an SVG diagram. While a message is still
 * streaming the code is often syntactically incomplete, so rendering is
 * debounced and any parse error silently falls back to the raw code — the
 * diagram appears once the block is valid.
 */
export function MermaidDiagram({ code }: { code: string }) {
  const reactId = useId();
  const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const dark = isDarkMode();
      loadMermaid(dark)
        .then((mermaid) => mermaid.render(`${renderId}-${Date.now()}`, code))
        .then(({ svg: rendered }) => {
          if (!active) return;
          setSvg(rendered);
          setFailed(false);
        })
        .catch(() => {
          if (!active) return;
          setFailed(true);
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [code, renderId]);

  // Show the rendered diagram once available. Until then (or on parse error
  // during streaming) fall back to the raw source so nothing ever crashes.
  if (svg && !failed) {
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
