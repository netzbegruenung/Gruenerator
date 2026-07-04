import { type Slide } from '@gruenerator/contracts';
import { type ComponentProps, type CSSProperties } from 'react';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import 'katex/dist/katex.min.css';

export interface SlideSurfaceProps {
  slide: Slide;
  /** Inline-edit the title/body (editor canvas). */
  editable?: boolean;
  onChange?: (patch: Partial<Slide>) => void;
  /** Present mode: apply per-item `fragment` classes when the slide opts in. */
  presenting?: boolean;
}

const LAYOUT_CLASS: Record<Slide['layout'], string> = {
  title: 'layout-title',
  content: 'layout-content',
  split: 'layout-split',
  quote: 'layout-quote',
  image: 'layout-image',
  code: 'layout-code',
};

/** Grüne CI backgrounds that need light foreground text. */
const DARK_BG = new Set(['#316049', '#005538', '#52907a', '#0c1410']);

/**
 * Resolve `slide.background` (color / gradient / image URL) into an inline style
 * and whether the surface should use light text. In present mode reveal handles
 * backgrounds via data-* attrs, so this only styles the static editor surface.
 */
function resolveBackground(
  background: string | null | undefined,
  layout: Slide['layout']
): { style: CSSProperties | undefined; dark: boolean } {
  const bg = background?.trim();
  const layoutDark = layout === 'title' || layout === 'quote';
  if (!bg) return { style: undefined, dark: layoutDark };
  if (/^(https?:|data:|\/)/.test(bg)) {
    return {
      style: {
        backgroundImage: `url("${bg}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
      dark: true,
    };
  }
  if (/gradient\(/.test(bg)) return { style: { background: bg }, dark: true };
  return { style: { background: bg }, dark: DARK_BG.has(bg.toLowerCase()) || layoutDark };
}

/**
 * One slide rendered at a fixed 960×540 on the shared `.gruene-slide` surface.
 * The parent scales it to fit (editor canvas, thumbnails) or lets reveal.js
 * size it (present mode). Never a running reveal instance — just markup + CSS.
 */
export function SlideSurface({ slide, editable, onChange, presenting }: SlideSurfaceProps) {
  const layoutClass = LAYOUT_CLASS[slide.layout];
  const fragmentClass = presenting && slide.fragments ? 'fragment' : undefined;
  // `dark` (text contrast) is always derived from the resolved background. The
  // inline background style only applies to the static editor surface — in
  // present mode reveal paints the background via data-background-* attrs, so
  // the section itself stays transparent.
  const resolvedBg = resolveBackground(slide.background, slide.layout);
  const dark = resolvedBg.dark;
  const bgStyle = presenting ? undefined : resolvedBg.style;

  // In present mode: per-item fragments (opt-in) and click-to-zoom images
  // (reveal's built-in lightbox via data-preview-image).
  const mdComponents: ComponentProps<typeof Markdown>['components'] = presenting
    ? {
        ...(fragmentClass
          ? { li: ({ children }) => <li className={fragmentClass}>{children}</li> }
          : {}),
        img: ({ node: _node, ...props }) => <img {...props} data-preview-image="" />,
      }
    : undefined;

  const isCode = slide.layout === 'code';

  return (
    <div className={`gruene-slide ${layoutClass}${dark ? ' is-dark' : ''}`} style={bgStyle}>
      {editable ? (
        <textarea
          className="gruene-slide__input gruene-slide__title"
          value={slide.title}
          placeholder="Folientitel"
          rows={1}
          onChange={(e) => onChange?.({ title: e.target.value })}
        />
      ) : (
        slide.title.trim() !== '' && <h2 className="gruene-slide__title">{slide.title}</h2>
      )}

      {isCode ? (
        editable ? (
          <textarea
            className="gruene-slide__input gruene-slide__code"
            value={slide.body}
            placeholder="Quellcode …"
            spellCheck={false}
            onChange={(e) => onChange?.({ body: e.target.value })}
          />
        ) : (
          <pre className="gruene-slide__body">
            <code
              {...(slide.codeLanguage ? { 'data-language': slide.codeLanguage } : {})}
              className={slide.codeLanguage ? `language-${slide.codeLanguage}` : undefined}
            >
              {slide.body}
            </code>
          </pre>
        )
      ) : editable ? (
        <textarea
          className="gruene-slide__input gruene-slide__body"
          value={slide.body}
          placeholder="Inhalt (Markdown, LaTeX mit $…$) …"
          onChange={(e) => onChange?.({ body: e.target.value })}
        />
      ) : (
        <div className="gruene-slide__body">
          <Markdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={mdComponents}
          >
            {slide.body}
          </Markdown>
        </div>
      )}
    </div>
  );
}
