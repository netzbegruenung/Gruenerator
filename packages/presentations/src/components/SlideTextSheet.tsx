import { type Slide } from '@gruenerator/contracts';
import { useEffect, useRef, useState } from 'react';

import { MobileSheet } from './MobileSheet.js';

export interface SlideTextSheetProps {
  slide: Slide;
  field: 'title' | 'body';
  onChange: (patch: Partial<Slide>) => void;
  onClose: () => void;
}

const LABEL: Record<'title' | 'body', string> = {
  title: 'Folientitel',
  body: 'Folieninhalt',
};

/**
 * Focus editor for a slide's text on touch devices. The input lives outside the
 * scaled canvas at a full 16px, which is what makes it typable on a phone.
 *
 * The draft is committed when the sheet closes, not per keystroke: a body write
 * goes through `writeSlideBody`, which re-seeds the whole Y.XmlFragment from
 * markdown — doing that on every character would churn the CRDT and fight
 * concurrent editors.
 */
export function SlideTextSheet({ slide, field, onChange, onClose }: SlideTextSheetProps) {
  const initial = field === 'title' ? slide.title : slide.body;
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const finish = () => {
    const value = draftRef.current;
    if (value !== initial) onChange(field === 'title' ? { title: value } : { body: value });
    onClose();
  };

  const isCode = field === 'body' && slide.layout === 'code';
  const hint =
    field === 'title'
      ? 'Kurz und einprägsam – erscheint als Überschrift der Folie.'
      : isCode
        ? 'Quellcode – wird unformatiert dargestellt.'
        : 'Markdown wird unterstützt: - für Listen, **fett**, $…$ für Formeln.';

  return (
    <MobileSheet title={LABEL[field]} onClose={finish}>
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={!isCode}
        placeholder={field === 'title' ? 'Folientitel' : 'Inhalt der Folie …'}
        // 16px minimum, otherwise iOS Safari zooms the whole page on focus.
        className={`w-full resize-y rounded-xl border border-[#D4DDD7] bg-white p-3 text-base leading-relaxed text-[#1B2A22] outline-none focus:border-primary-500 dark:border-grey-600 dark:bg-grey-800 dark:text-grey-100 ${
          field === 'title' ? 'min-h-[5rem]' : 'min-h-[11rem]'
        } ${isCode ? 'font-mono' : ''}`}
        rows={field === 'title' ? 2 : 7}
      />
      <p className="pt-2 text-xs text-[#6E7E74] dark:text-grey-400">{hint}</p>
      <button
        type="button"
        onClick={finish}
        className="mt-3 h-12 w-full rounded-full bg-primary-600 text-sm font-bold text-white hover:brightness-110"
      >
        Fertig
      </button>
    </MobileSheet>
  );
}
