import { PRESENTATION_DEFAULT_ACCENT, type Slide } from '@gruenerator/contracts';
import { type ComponentProps, type CSSProperties } from 'react';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import 'katex/dist/katex.min.css';

export interface SlideSurfaceProps {
  slide: Slide;
  /** Deck brand accent colour (drives default backgrounds, markers, bars). */
  accent?: string | null;
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

const SAND = '#f5f1e9';
const WHITE = '#ffffff';

/**
 * Default background for a (layout, variant): title 0→accent / 1→white / 2→sand;
 * quote 0→accent / 1→sand; everything else white. A slide's own `background`
 * overrides this.
 */
function defaultBg(layout: Slide['layout'], variant: number, accent: string): string {
  if (layout === 'title') return [accent, WHITE, SAND][variant] ?? accent;
  if (layout === 'quote') return [accent, SAND][variant] ?? accent;
  return WHITE;
}

/** Perceived-luminance dark test so any accent hex classifies correctly. */
function isDarkColor(c: string): boolean {
  const hex = c.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return /^#(00|31|0c|1b)/i.test(c);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/**
 * Resolve the effective background (own background, else the variant default)
 * into an inline style plus whether the surface uses light text. Applied on the
 * static surface in BOTH the editor and present mode — SlideSurface owns the
 * background so there is a single classifier (reveal doesn't paint it).
 */
function resolveBackground(slide: Slide, accent: string): { style: CSSProperties; dark: boolean } {
  const bg = slide.background?.trim() || defaultBg(slide.layout, slide.variant ?? 0, accent);
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
  return { style: { background: bg }, dark: isDarkColor(bg) };
}

/**
 * One slide rendered at a fixed 960×540 on the shared `.gruene-slide` surface,
 * honouring the layout + design variant + deck accent. The parent scales it to
 * fit (editor canvas, thumbnails) or lets reveal.js size it (present mode).
 * Never a running reveal instance — just markup + CSS.
 */
export function SlideSurface({ slide, accent, editable, onChange, presenting }: SlideSurfaceProps) {
  const deckAccent = accent?.trim() || PRESENTATION_DEFAULT_ACCENT;
  const variant = slide.variant ?? 0;
  const layoutClass = LAYOUT_CLASS[slide.layout];
  const fragmentClass = presenting && slide.fragments ? 'fragment' : undefined;
  const { style: bgStyle, dark } = resolveBackground(slide, deckAccent);

  const mdComponents: ComponentProps<typeof Markdown>['components'] = presenting
    ? {
        ...(fragmentClass
          ? { li: ({ children }) => <li className={fragmentClass}>{children}</li> }
          : {}),
        img: ({ node: _node, ...props }) => <img {...props} data-preview-image="" />,
      }
    : undefined;

  const isCode = slide.layout === 'code';
  const isTitle = slide.layout === 'title';

  return (
    <div
      className={`gruene-slide ${layoutClass} variant-${variant}${dark ? ' is-dark' : ''}`}
      style={{ ...bgStyle, '--deck-accent': deckAccent } as CSSProperties}
    >
      {/* Title-variant decoration: Sand (v2) top bar, Geteilt (v1) side panel. */}
      {isTitle && variant === 2 && <span className="gruene-slide__bar" aria-hidden="true" />}

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

      {isTitle && variant === 1 && <span className="gruene-slide__side" aria-hidden="true" />}
    </div>
  );
}
