import { type TrashKind, trashKindSchema } from '@gruenerator/contracts';
import {
  Alert,
  AlertDescription,
  Button,
  ConfirmDialogProvider,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  useConfirm,
} from '@gruenerator/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PiTrash } from 'react-icons/pi';

import PageContainer from '../../components/common/PageContainer';

import { TRASH_KIND_LABELS } from './trashKinds';
import TrashRow from './TrashRow';
import { useEmptyTrash, useTrashList } from './useTrash';

const ALL = 'all';

function TrashContent() {
  const [kind, setKind] = useState<TrashKind | null>(null);
  const list = useTrashList(kind);
  const emptyTrash = useEmptyTrash();
  const confirm = useConfirm();
  const filterRef = useRef<HTMLButtonElement | null>(null);
  // A removed row takes its focused button with it; the focus lands on the
  // toolbar instead of falling back to <body>.
  const focusAfterRemoval = useRef(false);

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);

  useEffect(() => {
    if (!focusAfterRemoval.current) return;
    focusAfterRemoval.current = false;
    filterRef.current?.focus();
  }, [items]);

  const markRemoval = () => {
    focusAfterRemoval.current = true;
  };

  const handleEmpty = async () => {
    const ok = await confirm({
      title: 'Papierkorb leeren?',
      description:
        'Alle Inhalte im Papierkorb werden endgültig gelöscht. Das kann nicht rückgängig gemacht werden.',
      confirmLabel: 'Papierkorb leeren',
    });
    if (!ok) return;
    markRemoval();
    emptyTrash.mutate();
  };

  return (
    <>
      <div className="mb-lg flex flex-wrap items-center justify-between gap-sm">
        <Select
          value={kind ?? ALL}
          onValueChange={(value) => {
            const parsed = trashKindSchema.safeParse(value);
            setKind(parsed.success ? parsed.data : null);
          }}
        >
          <SelectTrigger ref={filterRef} className="w-[16rem]" aria-label="Inhalte filtern">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Inhalte</SelectItem>
            {trashKindSchema.options.map((option) => (
              <SelectItem key={option} value={option}>
                {TRASH_KIND_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={items.length === 0 || emptyTrash.isPending}
          onClick={() => void handleEmpty()}
        >
          <PiTrash aria-hidden="true" className="mr-xs size-4" />
          Papierkorb leeren
        </Button>
      </div>

      {list.isPending ? (
        <div className="flex flex-col gap-sm" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
          ))}
        </div>
      ) : list.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-sm">
            Der Papierkorb konnte nicht geladen werden.
            <Button type="button" size="sm" variant="outline" onClick={() => void list.refetch()}>
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <div className="py-xl text-center">
          <p className="m-0 font-medium text-foreground-heading">Der Papierkorb ist leer.</p>
          <p className="m-0 mt-xs text-sm text-muted-foreground">
            Gelöschte Inhalte landen hier und lassen sich 30 Tage lang wiederherstellen.
          </p>
        </div>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-sm p-0">
            {items.map((item) => (
              <TrashRow key={`${item.kind}:${item.id}`} item={item} onRemove={markRemoval} />
            ))}
          </ul>
          {list.hasNextPage && (
            <div className="mt-lg flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={list.isFetchingNextPage}
                aria-busy={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                Mehr laden
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function TrashPage() {
  return (
    <PageContainer
      maxWidth="lg"
      title="Papierkorb"
      subtitle="Gelöschte Inhalte bleiben 30 Tage erhalten und werden danach endgültig gelöscht."
    >
      <ConfirmDialogProvider>
        <TrashContent />
      </ConfirmDialogProvider>
    </PageContainer>
  );
}
