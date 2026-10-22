/**
 * Die Folienlayouts im „Seite hinzufügen"-Picker einer Präsentation, nach
 * Grund gruppiert. Jede Kachel zeigt die Folie selbst (`SlideLayoutThumbnail`).
 */
import { memo, useMemo } from 'react';

import { buildSlideLayout, SLIDE_LAYOUTS, type SlideLayoutId } from './slideLayouts';
import { SlideLayoutThumbnail } from './SlideLayoutThumbnail';

import type { BrandLocale } from '../brand/theme';

const GROUPS = [
  { theme: 'dunkel', title: 'Dunkel' },
  { theme: 'hell', title: 'Hell' },
] as const;

interface SlideLayoutPickerProps {
  locale: BrandLocale;
  onSelect: (id: SlideLayoutId) => void;
}

export const SlideLayoutPicker = memo(function SlideLayoutPicker({
  locale,
  onSelect,
}: SlideLayoutPickerProps) {
  const states = useMemo(() => {
    const date = new Date();
    return new Map(
      SLIDE_LAYOUTS.map(({ id }, i) => [
        id,
        buildSlideLayout(id, { locale, pageNumber: i + 1, date }),
      ])
    );
  }, [locale]);

  return (
    <div className="mb-3 flex flex-col gap-3">
      {GROUPS.map((group) => (
        <section key={group.theme} aria-label={`Folienlayouts ${group.title}`}>
          <h4 className="m-0 mb-1.5 text-xs font-semibold text-[var(--editor-text-secondary)]">
            {group.title}
          </h4>
          <div className="grid grid-cols-4 gap-1.5 max-[480px]:grid-cols-3">
            {SLIDE_LAYOUTS.filter((l) => l.theme === group.theme).map((layout) => (
              <button
                key={layout.id}
                type="button"
                onClick={() => onSelect(layout.id)}
                className="flex flex-col gap-1 p-1 rounded-md border border-[var(--editor-border)] bg-[var(--editor-tile)] text-[var(--editor-text)] cursor-pointer transition-[border-color,transform] duration-150 hover:border-[var(--editor-accent)] hover:-translate-y-0.5 focus-visible:border-[var(--editor-accent)]"
              >
                <span className="block w-full overflow-hidden rounded-sm">
                  <SlideLayoutThumbnail state={states.get(layout.id)!} />
                </span>
                <span className="text-[10px] font-medium leading-tight text-center line-clamp-1">
                  {layout.label}
                  <span className="sr-only">, {group.title.toLowerCase()}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
});
