import {
  getPresentationBrandTheme,
  PRESENTATION_FONT_SIZE_SCALE,
  type Slide,
} from '@gruenerator/contracts';
import { type ComponentProps, type CSSProperties } from 'react';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { type Doc as YDoc } from 'yjs';

import { useAutoFitScale } from '../lib/useAutoFitScale.js';

import { InlineEditable } from './InlineEditable.js';
import { SlideBodyEditor } from './SlideBodyEditor.js';

import 'katex/dist/katex.min.css';

export interface SlideSurfaceProps {
  slide: Slide;
  /** Deck brand accent colour (drives default backgrounds, markers, bars). */
  accent?: string | null;
  /** Country CI ('de-DE' | 'de-AT'); anything else renders the de-DE theme. */
  brand?: string | null;
  /** Render the party logo on title-layout slides (deck option, default on). */
  showLogo?: boolean;
  /** Inline-edit the title/body (editor canvas). */
  editable?: boolean;
  /** The deck Y.Doc — required for WYSIWYG body editing (editor canvas only). */
  ydoc?: YDoc | null;
  onChange?: (patch: Partial<Slide>) => void;
  /** Present mode: apply per-item `fragment` classes when the slide opts in. */
  presenting?: boolean;
  /**
   * Touch editing. When set, the surface renders read-only and a tap on the
   * title/body asks the parent to open a focus editor instead. The canvas is
   * scaled to ~0.35 on a phone, and `contentEditable` inside a CSS transform has
   * unusable carets and selection handles on iOS Safari — so on touch we never
   * edit in place.
   */
  onRequestEdit?: (field: 'title' | 'body') => void;
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
export function SlideSurface({
  slide,
  accent,
  brand,
  showLogo,
  editable,
  ydoc,
  onChange,
  presenting,
  onRequestEdit,
}: SlideSurfaceProps) {
  const touchEdit = !!editable && !!onRequestEdit;
  const inlineEdit = !!editable && !touchEdit;
  const theme = getPresentationBrandTheme(brand);
  const deckAccent = accent?.trim() || theme.defaultAccent;
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

  // Explicit preset scale, or auto-fit ("Auto"). Code slides are excluded from
  // auto-fit: their body is its own scroll container, so the surface never
  // overflows and a fit pass would be a no-op anyway.
  const presetScale = slide.fontSize ? PRESENTATION_FONT_SIZE_SCALE[slide.fontSize] : null;
  const { ref: surfaceRef, scale: autoScale } = useAutoFitScale(
    presetScale == null && !isCode,
    `${slide.layout}|${variant}|${theme.brand}|${slide.title}|${slide.body}`
  );
  const fontScale = presetScale ?? autoScale;

  // Variant 1 (Geteilt) puts the accent side panel bottom-right where the logo
  // sits, so the logo needs its on-dark variant even on a light surface.
  const logoOnDark = dark || (isTitle && variant === 1);

  return (
    <div
      ref={surfaceRef}
      className={`gruene-slide ${layoutClass} variant-${variant}${dark ? ' is-dark' : ''}${
        theme.brand === 'de-AT' ? ' brand-at' : ''
      }`}
      style={
        { ...bgStyle, '--deck-accent': deckAccent, '--gs-font-scale': fontScale } as CSSProperties
      }
    >
      {/* Title-variant decoration: Sand (v2) top bar, Geteilt (v1) side panel. */}
      {isTitle && variant === 2 && <span className="gruene-slide__bar" aria-hidden="true" />}

      {isTitle && showLogo !== false && (
        <img
          className="gruene-slide__logo"
          src={logoOnDark ? theme.logo.dark.webPath : theme.logo.light.webPath}
          style={{ height: theme.logo.heightPx }}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}

      {inlineEdit ? (
        <InlineEditable
          className="gruene-slide__input gruene-slide__title"
          value={slide.title}
          placeholder="Folientitel"
          onChange={(title) => onChange?.({ title })}
        />
      ) : touchEdit ? (
        <h2
          className="gruene-slide__title gruene-slide__tappable"
          role="button"
          tabIndex={0}
          onClick={() => onRequestEdit('title')}
          aria-label="Folientitel bearbeiten"
        >
          {slide.title.trim() !== '' ? slide.title : 'Folientitel'}
        </h2>
      ) : (
        slide.title.trim() !== '' && <h2 className="gruene-slide__title">{slide.title}</h2>
      )}

      {touchEdit ? (
        <div
          className={`${isCode ? 'gruene-slide__body' : 'gruene-slide__body'} gruene-slide__tappable`}
          role="button"
          tabIndex={0}
          onClick={() => onRequestEdit('body')}
          aria-label="Folieninhalt bearbeiten"
        >
          {slide.body.trim() === '' ? (
            <p className="gruene-slide__placeholder">Tippen, um Inhalt hinzuzufügen</p>
          ) : isCode ? (
            <pre>
              <code
                {...(slide.codeLanguage ? { 'data-language': slide.codeLanguage } : {})}
                className={slide.codeLanguage ? `language-${slide.codeLanguage}` : undefined}
              >
                {slide.body}
              </code>
            </pre>
          ) : (
            <Markdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={mdComponents}
            >
              {slide.body}
            </Markdown>
          )}
        </div>
      ) : isCode ? (
        inlineEdit ? (
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
      ) : inlineEdit && ydoc ? (
        <SlideBodyEditor key={slide.id} ydoc={ydoc} slideId={slide.id} />
      ) : inlineEdit ? (
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
