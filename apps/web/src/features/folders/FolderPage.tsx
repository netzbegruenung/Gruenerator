import { buildChatThreadSlug } from '@gruenerator/shared/utils';
import { useState } from 'react';
import { PiFolder, PiPencilSimple, PiTrash, PiChatCircle } from 'react-icons/pi';
import { useNavigate, useParams } from 'react-router-dom';

import { useFolders, useThreadsInFolder, useRenameFolder, useDeleteFolder } from './api';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';

function FolderPageInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: folders = [] } = useFolders();
  const { threads, isLoading } = useThreadsInFolder(id);
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();

  const folder = folders.find((f) => f.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  if (!folder) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-foreground-muted">
        Ordner nicht gefunden.
      </div>
    );
  }

  const startRename = () => {
    setName(folder.name);
    setEditing(true);
  };
  const submitRename = async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== folder.name) {
      await renameFolder.mutateAsync({ id: folder.id, name: trimmed }).catch(() => {});
    }
    setEditing(false);
  };
  const onDelete = async () => {
    if (!confirm(`Ordner „${folder.name}" löschen? Die Chats bleiben erhalten.`)) return;
    await deleteFolder.mutateAsync(folder.id).catch(() => {});
    void navigate('/chat');
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <PiFolder size={28} className="shrink-0 text-primary-600" />
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void submitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xl font-semibold outline-none focus:border-primary-400"
          />
        ) : (
          <h1 className="flex-1 text-2xl font-semibold text-foreground">{folder.name}</h1>
        )}
        <button
          type="button"
          onClick={startRename}
          className="rounded-md p-2 text-foreground-muted transition-colors hover:bg-secondary-50 hover:text-foreground dark:hover:bg-secondary-800/40"
          aria-label="Ordner umbenennen"
          title="Umbenennen"
        >
          <PiPencilSimple size={18} />
        </button>
        <button
          type="button"
          onClick={() => void onDelete()}
          className="rounded-md p-2 text-foreground-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          aria-label="Ordner löschen"
          title="Löschen"
        >
          <PiTrash size={18} />
        </button>
      </div>

      <p className="mb-4 text-sm text-foreground-muted">
        Der Grünerator kennt die Chats in diesem Ordner und kann sie gezielt durchsuchen. Sortiere
        weitere Chats über „Verschieben nach…“ im Menü eines Chats hierher.
      </p>

      {isLoading ? (
        <div className="text-foreground-muted">Wird geladen…</div>
      ) : threads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-foreground-muted">
          Noch keine Chats in diesem Ordner.
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {threads.map((t) => {
            const slug = t.slugSuffix ? buildChatThreadSlug(t.title, t.slugSuffix) : t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/chat/${slug}`)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-secondary-50 dark:hover:bg-secondary-800/40"
                >
                  <PiChatCircle size={18} className="shrink-0 text-grey-500" />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {t.title || 'Neue Unterhaltung'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const FolderPage = withAuthRequired(FolderPageInner);
