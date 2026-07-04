import { type Slide } from '@gruenerator/contracts';
import { type ComponentProps } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
};

/**
 * One slide rendered at a fixed 960×540 on the shared `.gruene-slide` surface.
 * The parent scales it to fit (editor canvas, thumbnails) or lets reveal.js
 * size it (present mode). Never a running reveal instance — just markup + CSS.
 */
export function SlideSurface({ slide, editable, onChange, presenting }: SlideSurfaceProps) {
  const layoutClass = LAYOUT_CLASS[slide.layout];
  const fragmentClass = presenting && slide.fragments ? 'fragment' : undefined;

  const liComponents: ComponentProps<typeof Markdown>['components'] = fragmentClass
    ? { li: ({ children }) => <li className={fragmentClass}>{children}</li> }
    : undefined;

  return (
    <div className={`gruene-slide ${layoutClass}`}>
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

      {editable ? (
        <textarea
          className="gruene-slide__input gruene-slide__body"
          value={slide.body}
          placeholder="Inhalt (Markdown) …"
          onChange={(e) => onChange?.({ body: e.target.value })}
        />
      ) : (
        <div className="gruene-slide__body">
          <Markdown remarkPlugins={[remarkGfm]} components={liComponents}>
            {slide.body}
          </Markdown>
        </div>
      )}
    </div>
  );
}
