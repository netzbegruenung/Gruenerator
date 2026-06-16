import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { memo, useState } from 'react';
import { FiArchive, FiCopy, FiTrash2 } from 'react-icons/fi';

interface DangerZoneSectionProps {
  isArchived: boolean;
  onArchiveToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Destructive / irreversible board actions, consolidated from the ⋯ menu. */
export const DangerZoneSection = memo(function DangerZoneSection({
  isArchived,
  onArchiveToggle,
  onDuplicate,
  onDelete,
}: DangerZoneSectionProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <section className="flex max-w-2xl flex-col gap-md">
      <div>
        <h2 className="text-base font-semibold text-foreground">Gefahrenzone</h2>
        <p className="mt-0.5 text-sm text-grey-500">Archivieren, duplizieren oder löschen.</p>
      </div>

      <Row
        title="Board duplizieren"
        description="Erstellt eine Kopie mit Struktur und Beschreibung (ohne Kommentare/Anhänge)."
      >
        <Button size="sm" variant="outline" onClick={onDuplicate}>
          <FiCopy size={14} className="mr-1.5" /> Duplizieren
        </Button>
      </Row>

      <Row
        title={isArchived ? 'Board wiederherstellen' : 'Board archivieren'}
        description={
          isArchived
            ? 'Holt das Board zurück in die aktive Liste.'
            : 'Blendet das Board aus der aktiven Liste aus. Reversibel.'
        }
      >
        <Button size="sm" variant="outline" onClick={onArchiveToggle}>
          <FiArchive size={14} className="mr-1.5" />{' '}
          {isArchived ? 'Wiederherstellen' : 'Archivieren'}
        </Button>
      </Row>

      <Row
        title="Board löschen"
        description="Dieses Board und alle Karten werden unwiderruflich gelöscht."
      >
        <Button
          size="sm"
          variant="outline"
          className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
          onClick={() => setDeleteConfirmOpen(true)}
        >
          <FiTrash2 size={14} className="mr-1.5" /> Löschen
        </Button>
      </Row>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Board löschen?</DialogTitle>
            <DialogDescription>
              Dieses Board und alle Karten werden unwiderruflich gelöscht.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
              onClick={() => {
                setDeleteConfirmOpen(false);
                onDelete();
              }}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
});

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-md rounded-md border border-grey-200 px-3 py-3 dark:border-grey-700">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-grey-500">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
