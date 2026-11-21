import { SITE_BLOCKS_MAX, siteBlockSpec } from '@gruenerator/contracts';
import { Button, cn } from '@gruenerator/ui';
import { useRef, useState, type ReactNode } from 'react';
import { FiArrowDown, FiArrowUp, FiCopy, FiEye, FiEyeOff, FiTrash2 } from 'react-icons/fi';

import { useDraft, useDraftActions } from '../../draft/SiteDraftContext';
import { SITE_BLOCK_UI } from '../blockUi';
import { ConfirmAlert } from '../publish/DeleteSiteDialog';

import { blockLabels } from './blockLabels';

interface PagePanelProps {
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
}

function RowButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** The page's blocks in order: select one, move it, hide it, duplicate it or delete it. */
export function PagePanel({ selectedBlockId, onSelectBlock }: PagePanelProps) {
  const blocks = useDraft((d) => d.blocks);
  const actions = useDraftActions();
  const labels = blockLabels(blocks);
  const listRef = useRef<HTMLOListElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const full = blocks.length >= SITE_BLOCKS_MAX;

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-[var(--editor-text-secondary)]">
        Reihenfolge und Sichtbarkeit der Bausteine. Das Profil steht immer oben.
      </p>
      <ol
        ref={listRef}
        aria-label="Bausteine der Seite"
        className="m-0 flex list-none flex-col gap-1 p-0"
      >
        {blocks.map((block, index) => {
          const ui = SITE_BLOCK_UI[block.type];
          const Icon = ui.icon;
          const label = labels.get(block.id) ?? ui.label;
          const spec = siteBlockSpec(block.type);
          const hidden = block.hidden === true;
          const atTypeMax =
            spec.max !== null && blocks.filter((b) => b.type === block.type).length >= spec.max;
          const cannotMoveUp = blocks[index - 1]?.type === 'hero' || index === 0;
          return (
            <li
              key={block.id}
              className={cn(
                'flex items-center gap-1 rounded-lg border px-2 py-1',
                selectedBlockId === block.id
                  ? 'border-[var(--editor-accent)] bg-[var(--editor-active-bg)]'
                  : 'border-[var(--editor-border)]'
              )}
            >
              <button
                type="button"
                onClick={() => onSelectBlock(block.id)}
                aria-current={selectedBlockId === block.id ? 'true' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent py-1 text-left text-sm font-semibold text-[var(--editor-text)]',
                  hidden && 'text-[var(--editor-text-muted)]'
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
                {hidden && (
                  <span className="shrink-0 text-xs font-normal text-[var(--editor-text-muted)]">
                    Ausgeblendet
                  </span>
                )}
              </button>
              {!spec.pinned && (
                <div role="group" aria-label={`${label}: Aktionen`} className="flex shrink-0">
                  <RowButton
                    label={`${label} nach oben`}
                    disabled={cannotMoveUp}
                    onClick={() => actions.moveBlock(block.id, index - 1)}
                  >
                    <FiArrowUp />
                  </RowButton>
                  <RowButton
                    label={`${label} nach unten`}
                    disabled={index === blocks.length - 1}
                    onClick={() => actions.moveBlock(block.id, index + 1)}
                  >
                    <FiArrowDown />
                  </RowButton>
                  <RowButton
                    label={`${label} ausblenden`}
                    pressed={hidden}
                    onClick={() => actions.setBlockHidden(block.id, !hidden)}
                  >
                    {hidden ? <FiEyeOff /> : <FiEye />}
                  </RowButton>
                  <RowButton
                    label={`${label} doppeln`}
                    disabled={full || atTypeMax}
                    onClick={() => {
                      const id = actions.duplicateBlock(block.id);
                      if (id) onSelectBlock(id);
                    }}
                  >
                    <FiCopy />
                  </RowButton>
                  <RowButton label={`${label} löschen`} onClick={() => setPendingDelete(block.id)}>
                    <FiTrash2 />
                  </RowButton>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <ConfirmAlert
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`${labels.get(pendingDelete ?? '') ?? 'Baustein'} löschen?`}
        description="Der Baustein und sein Inhalt verschwinden von der Seite."
        confirmLabel="Löschen"
        returnFocusRef={listRef}
        onConfirm={() => {
          if (pendingDelete) actions.removeBlock(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
