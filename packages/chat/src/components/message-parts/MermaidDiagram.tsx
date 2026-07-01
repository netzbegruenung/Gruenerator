import { useEffect, useState } from 'react';

// Mermaid is heavy (~500kb) and only needed when a diagram actually appears, so
// the module is lazy-imported once. Theme is applied per render (not baked into
// this cached import) so light/dark toggles re-theme diagrams.
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => mermaid);
  }
  return mermaidPromise;
}

// Monotonic id for mermaid.render — must be unique per call and DOM-id-safe.
let renderSeq = 0;

/** Track the app's dark mode by observing the `dark` class / `data-theme`
 *  attribute on <html>, so a theme toggle re-renders the diagram. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/**
 * Renders a ```mermaid code block as an SVG diagram. While a message is still
 * streaming the code is often syntactically incomplete, so rendering is
 * debounced and a parse error keeps the last good render (or the raw code until
 * the first valid one) — nothing ever crashes or flickers to raw mid-stream.
 */
export function MermaidDiagram({ code }: { code: string }) {
  const dark = useIsDark();
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      loadMermaid()
        .then((mermaid) => {
          // Re-initialize per render so the current theme is applied.
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: dark ? 'dark' : 'default',
          });
          return mermaid.render(`mermaid-${(renderSeq += 1)}`, code);
        })
        .then(({ svg: rendered }) => {
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
  }, [code, dark]);

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
