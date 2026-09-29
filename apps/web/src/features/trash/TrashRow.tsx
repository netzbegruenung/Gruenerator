import { type TrashItem } from '@gruenerator/contracts';
import { Button, useConfirm } from '@gruenerator/ui';
import { createElement } from 'react';

import { formatRelativeDate } from '../../utils/dateFormatter';

import { purgeCountdown, trashItemIcon, trashItemLabel } from './trashKinds';
import { usePurgeTrashItem, useRestoreTrashItem } from './useTrash';

interface TrashRowProps {
  item: TrashItem;
  /** Called when the row is about to disappear, so the page can take the focus. */
  onRemove: () => void;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export default function TrashRow({ item, onRemove }: TrashRowProps) {
  const restore = useRestoreTrashItem();
  const purge = usePurgeTrashItem();
  const confirm = useConfirm();
  const title = item.title.trim() || 'Ohne Titel';

  const handlePurge = async () => {
    const ok = await confirm({
      title: `„${title}“ endgültig löschen?`,
      description: 'Das kann nicht rückgängig gemacht werden.',
      confirmLabel: 'Endgültig löschen',
    });
    if (!ok) return;
    onRemove();
    purge.mutate(item);
  };

  return (
    <li className="flex flex-wrap items-center gap-md rounded-lg border border-border p-md">
      {createElement(trashItemIcon(item), {
        'aria-hidden': true,
        className: 'size-6 shrink-0 text-muted-foreground',
      })}
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate font-medium text-foreground-heading">{title}</p>
        <p className="m-0 text-sm text-muted-foreground">
          {trashItemLabel(item)} ·{' '}
          {item.deletedBeforeTrash
            ? 'vor Einführung des Papierkorbs gelöscht'
            : `gelöscht ${lowerFirst(formatRelativeDate(item.deletedAt))}`}{' '}
          · {purgeCountdown(item.purgeAt)}
        </p>
      </div>
      <div className="flex items-center gap-sm">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Wiederherstellen „${title}“`}
          disabled={restore.isPending}
          onClick={() => {
            onRemove();
            restore.mutate(item);
          }}
        >
          Wiederherstellen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Endgültig löschen „${title}“`}
          disabled={purge.isPending}
          onClick={() => void handlePurge()}
        >
          Endgültig löschen
        </Button>
      </div>
    </li>
  );
}
