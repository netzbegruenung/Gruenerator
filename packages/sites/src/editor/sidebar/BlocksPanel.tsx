import { SITE_BLOCKS_MAX, SITE_BLOCK_TYPES } from '@gruenerator/contracts';

import { useDraft, useDraftActions } from '../../draft/SiteDraftContext';
import { SITE_BLOCK_UI } from '../blockUi';

interface BlocksPanelProps {
  /** New blocks go right after this one; without a selection, at the end of the page. */
  selectedBlockId: string | null;
  onAdded: (blockId: string) => void;
}

/** Adds a block of a type to the page. Types at their limit, and a full page, are greyed out. */
export function BlocksPanel({ selectedBlockId, onAdded }: BlocksPanelProps) {
  const blocks = useDraft((d) => d.blocks);
  const { addBlock, setBlockHidden } = useDraftActions();
  const full = blocks.length >= SITE_BLOCKS_MAX;
  const selectedIndex = blocks.findIndex((b) => b.id === selectedBlockId);
  const insertAt = selectedIndex === -1 ? blocks.length : selectedIndex + 1;

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
          return (
            <li key={spec.type}>
              <button
                type="button"
                disabled={hiddenSingle === null && (full || atMax)}
                onClick={() => {
                  if (hiddenSingle) {
                    if (setBlockHidden(hiddenSingle.id, false)) onAdded(hiddenSingle.id);
                    return;
                  }
                  const id = addBlock(spec.type, insertAt);
                  if (id) onAdded(id);
                }}
                className="flex w-full cursor-pointer items-start gap-3 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)] p-3 text-left transition-colors hover:enabled:bg-[var(--editor-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
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
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
