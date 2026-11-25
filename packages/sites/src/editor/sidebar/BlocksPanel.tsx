import { SITE_BLOCKS_MAX, SITE_BLOCK_TYPES } from '@gruenerator/contracts';
import { useEffect } from 'react';

import { useDraft, useDraftActions } from '../../draft/SiteDraftContext';
import { useAuth } from '../../SitesContext';
import { useEditorStore } from '../../stores/editorStore';
import { SITE_BLOCK_UI } from '../blockUi';

import { BlockThumbnail } from './BlockThumbnail';

interface BlocksPanelProps {
  /** New blocks go right after this one; without a selection, at the end of the page. */
  selectedBlockId: string | null;
  onAdded: (blockId: string) => void;
}

/**
 * Adds a block of a type to the page. Each card shows the block filled with example content;
 * pointing at one marks on the canvas where it would land. Types at their limit, and a full
 * page, are greyed out.
 */
export function BlocksPanel({ selectedBlockId, onAdded }: BlocksPanelProps) {
  const blocks = useDraft((d) => d.blocks);
  const variant = useDraft((d) => d.variant);
  const locale = useAuth().user?.locale ?? 'de-DE';
  const { addBlock, setBlockHidden } = useDraftActions();
  const setInsertPreview = useEditorStore((s) => s.setInsertPreview);
  const full = blocks.length >= SITE_BLOCKS_MAX;
  const selectedIndex = blocks.findIndex((b) => b.id === selectedBlockId);
  const insertAt = selectedIndex === -1 ? blocks.length : selectedIndex + 1;
  const insertAfter = blocks[insertAt - 1] ?? null;
  // A mark left over when the panel closes under the pointer would stay on the canvas.
  useEffect(() => () => setInsertPreview(null), [setInsertPreview]);

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-[var(--editor-text-secondary)]">
        {full
          ? `Die Seite hat schon ${SITE_BLOCKS_MAX} Bausteine.`
          : selectedIndex === -1
            ? 'Neue Bausteine kommen ans Ende der Seite.'
            : 'Neue Bausteine kommen hinter den ausgewählten.'}
      </p>
      <ul aria-label="Baustein hinzufügen" className="m-0 grid list-none grid-cols-1 gap-2 p-0">
        {SITE_BLOCK_TYPES.filter((spec) => !spec.pinned).map((spec) => {
          const ui = SITE_BLOCK_UI[spec.type];
          const Icon = ui.icon;
          const existing = blocks.filter((b) => b.type === spec.type);
          const atMax = spec.max !== null && existing.length >= spec.max;
          // A type that exists once per page and is hidden (Instagram starts that way): the
          // card shows it again instead of adding a second one.
          const hiddenSingle =
            atMax && existing.length === 1 && existing[0]?.hidden === true ? existing[0] : null;
          const canAdd = hiddenSingle !== null || !(full || atMax);
          // A hidden block comes back where it is; only a new one gets the insert mark.
          const showMark = () =>
            setInsertPreview(
              canAdd && !hiddenSingle && insertAfter
                ? { afterBlockId: insertAfter.id, label: `${ui.label} kommt hier hin` }
                : null
            );
          const hideMark = () => setInsertPreview(null);
          return (
            <li key={spec.type}>
              <button
                type="button"
                disabled={!canAdd}
                onPointerEnter={showMark}
                onPointerLeave={hideMark}
                onFocus={showMark}
                onBlur={hideMark}
                onClick={() => {
                  hideMark();
                  if (hiddenSingle) {
                    if (setBlockHidden(hiddenSingle.id, false)) onAdded(hiddenSingle.id);
                    return;
                  }
                  const id = addBlock(spec.type, insertAt);
                  if (id) onAdded(id);
                }}
                className="flex w-full cursor-pointer flex-col overflow-hidden rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)] p-0 text-left transition-colors hover:enabled:border-[var(--editor-accent)] hover:enabled:bg-[var(--editor-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BlockThumbnail type={spec.type} locale={locale} variant={variant} />
                <span className="flex items-start gap-3 border-t border-[var(--editor-border)] p-3">
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-[var(--editor-accent)]"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-[var(--editor-text)]">
                      {ui.label}
                    </span>
                    <span className="text-xs text-[var(--editor-text-secondary)]">
                      {hiddenSingle
                        ? 'Ist ausgeblendet. Wieder einblenden'
                        : atMax
                          ? 'Gibt es nur einmal pro Seite'
                          : ui.description}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
