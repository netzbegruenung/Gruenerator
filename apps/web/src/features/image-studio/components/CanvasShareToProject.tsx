import { GROUP_POST_MAX } from '@gruenerator/contracts';
import { errMessage, useCreateGroupPost, useUserGroups } from '@gruenerator/shared/groups';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { ShareNav } from '@ggraphic/editor/shell';

const fieldClass =
  'w-full rounded-md border border-[var(--editor-border)] bg-[var(--editor-tile)] px-2 py-1.5 text-sm text-[var(--editor-text)] outline-none focus-visible:border-[var(--editor-accent)]';

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head = '', data = ''] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png';
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: mime });
}

/**
 * Sub-page "Ins Projekt": posts the current page as an image into a project's
 * feed. Every project has one, whatever its stored type.
 */
export function CanvasShareToProject({ nav }: { nav: ShareNav }) {
  const groups = useUserGroups();
  const projects = groups.data ?? [];

  const [groupId, setGroupId] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ id: string; name: string } | null>(null);
  const createPost = useCreateGroupPost(groupId);

  // Only for the preview; the post captures again so it carries the latest edits.
  const { captureImage } = nav;
  useEffect(() => {
    let alive = true;
    void captureImage().then((url) => {
      if (alive) setPreview(url);
    });
    return () => {
      alive = false;
    };
  }, [captureImage]);

  const submit = async () => {
    if (!groupId) return;
    setError(null);
    try {
      const dataUrl = await nav.captureImage();
      if (!dataUrl) {
        setError('Das Bild konnte nicht erstellt werden.');
        return;
      }
      await createPost.mutateAsync({
        body,
        files: [dataUrlToFile(dataUrl, 'sharepic.png')],
      });
      setPosted({ id: groupId, name: projects.find((p) => p.id === groupId)?.name ?? '' });
    } catch (err) {
      const fallback = 'Der Beitrag konnte nicht gepostet werden.';
      setError(isAxiosError(err) ? errMessage(err.response?.data, fallback) : fallback);
    }
  };

  if (posted) {
    return (
      <div role="status" className="flex flex-col gap-2 py-2 text-sm text-[var(--editor-text)]">
        <p className="m-0 font-semibold">Im Projekt gepostet</p>
        <Link
          to={`/projekte/${posted.id}`}
          className="text-[var(--editor-active-fg)] underline underline-offset-2"
        >
          {posted.name ? `Zu „${posted.name}“` : 'Zum Projekt'}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-1">
      {preview && (
        <img
          src={preview}
          alt="Vorschau des Sharepics"
          className="max-h-40 w-full rounded-md border border-[var(--editor-border)] bg-[var(--editor-tile)] object-contain"
        />
      )}
      <select
        aria-label="Projekt"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        className={fieldClass}
      >
        <option value="">{groups.isLoading ? 'Lade Projekte…' : 'Projekt auswählen…'}</option>
        {projects.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <textarea
        aria-label="Text zum Beitrag"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={GROUP_POST_MAX}
        rows={3}
        placeholder="Text zum Beitrag (optional)"
        className={`${fieldClass} resize-y`}
      />
      {error && (
        <p role="alert" className="m-0 text-xs text-[var(--editor-danger-fg)]">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!groupId || createPost.isPending}
        className="flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border-none bg-[var(--editor-green-deep)] text-sm font-semibold text-white disabled:cursor-default disabled:opacity-50"
      >
        {createPost.isPending ? 'Wird gepostet…' : 'Posten'}
      </button>
    </div>
  );
}
