import { Badge, Dialog, DialogContent, DialogHeader, DialogTitle } from '@gruenerator/ui';

import type { Document } from '../../stores/documentStore';

interface MetadataDialogProps {
  doc: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHARE_MODE_LABELS: Record<string, string> = {
  private: 'Privat',
  authenticated: 'Angemeldete Nutzer*innen',
  public: 'Öffentlich',
};

const ACCESS_TYPE_LABELS: Record<string, string> = {
  owner: 'Eigentümer*in',
  direct: 'Direkt geteilt',
  group: 'Über Gruppe',
  public: 'Öffentlich',
};

const PERMISSION_LEVEL_LABELS: Record<string, string> = {
  owner: 'Eigentümer*in',
  editor: 'Bearbeiter*in',
  viewer: 'Betrachter*in',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-md py-1.5">
      <span className="shrink-0 text-sm text-grey-500 dark:text-grey-400">{label}</span>
      <span className="text-right text-sm text-foreground">{value}</span>
    </div>
  );
}

export function MetadataDialog({ doc, open, onOpenChange }: MetadataDialogProps) {
  const permissionEntries = Object.entries(doc.permissions || {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Dokumentdetails</DialogTitle>
        </DialogHeader>

        <div className="divide-y divide-grey-100 dark:divide-grey-700">
          <div className="pb-3">
            <Row label="Titel" value={doc.title} />
            <Row label="Typ" value={doc.document_subtype} />
            <Row
              label="ID"
              value={<code className="text-xs text-grey-500 dark:text-grey-400">{doc.id}</code>}
            />
          </div>

          <div className="py-3">
            <Row label="Erstellt von" value={doc.creator_name || doc.created_by} />
            <Row label="Erstellt am" value={formatDateTime(doc.created_at)} />
            <Row
              label="Zuletzt bearbeitet von"
              value={doc.last_editor_name || doc.last_edited_by}
            />
            <Row label="Zuletzt bearbeitet am" value={formatDateTime(doc.updated_at)} />
          </div>

          <div className="py-3">
            <Row
              label="Zugriff"
              value={
                doc.access_type ? (
                  <Badge variant="outline">
                    {ACCESS_TYPE_LABELS[doc.access_type] || doc.access_type}
                  </Badge>
                ) : null
              }
            />
            <Row label="Freigabemodus" value={SHARE_MODE_LABELS[doc.share_mode || 'private']} />
            <Row
              label="Freigabeberechtigung"
              value={
                doc.share_mode && doc.share_mode !== 'private'
                  ? PERMISSION_LEVEL_LABELS[doc.share_permission || 'editor']
                  : null
              }
            />
          </div>

          {permissionEntries.length > 0 && (
            <div className="pt-3">
              <p className="mb-2 text-sm font-medium text-foreground">
                Berechtigungen ({permissionEntries.length})
              </p>
              <div className="max-h-[160px] space-y-1 overflow-y-auto">
                {permissionEntries.map(([userId, perm]) => (
                  <div
                    key={userId}
                    className="flex items-center justify-between rounded-md bg-grey-50 px-2.5 py-1.5 text-xs dark:bg-grey-800"
                  >
                    <span className="truncate text-grey-600 dark:text-grey-300">{userId}</span>
                    <Badge variant="outline" className="ml-2 shrink-0 text-[0.625rem]">
                      {PERMISSION_LEVEL_LABELS[perm.level] || perm.level}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {doc.group_shares && doc.group_shares.length > 0 && (
            <div className="pt-3">
              <p className="mb-2 text-sm font-medium text-foreground">Gruppenfreigaben</p>
              <div className="flex flex-wrap gap-1.5">
                {doc.group_shares.map((g) => (
                  <Badge key={g.group_id} variant="outline">
                    {g.group_name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
