import { getContractsClient } from '@gruenerator/shared/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { FiCheckCircle } from 'react-icons/fi';
import { Link } from 'react-router-dom';

import { renderSharepicToImage } from '../renderSharepicToImage';
import { uploadBlobToMediaLibrary } from '../services/mediaUploadService';

interface SaveAsTemplateDialogProps {
  canvasId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Template type + state used to render the template thumbnail. */
  canvasType: string;
  initialState: Record<string, unknown>;
  defaultTitle?: string;
}

const parseTags = (raw: string): string[] => [
  ...new Set(
    raw
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').trim().toLowerCase())
      .filter(Boolean)
  ),
];

/**
 * "Als Vorlage speichern" for a collaborative canvas.
 *
 * Both actions go through the same endpoint — the server snapshots the canvas
 * either way — and differ only in `visibility`: a private save lands in Meine
 * Vorlagen as a draft, a submission enters the public gallery's review queue.
 * Deliberately separate from ShareCanvasDialog: that one is about giving other
 * people access to *this* document, this one mints a new, frozen artefact.
 */
export function SaveAsTemplateDialog({
  canvasId,
  open,
  onOpenChange,
  canvasType,
  initialState,
  defaultTitle,
}: SaveAsTemplateDialogProps) {
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [tagsRaw, setTagsRaw] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'submitted' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (visibility: 'private' | 'submit') => {
      setStatus('saving');
      setError(null);
      try {
        // Prefer the freshest live state for the thumbnail; fall back to the
        // state passed in if the live read fails.
        let stateForThumb: Record<string, unknown> = initialState;
        try {
          const st = await getContractsClient().canvas.getState({ params: { id: canvasId } });
          if (st.status === 200) stateForThumb = st.body.state;
        } catch {
          /* fall back to initialState */
        }

        const dataUrl = await renderSharepicToImage(canvasType, stateForThumb);
        if (!dataUrl) throw new Error('Vorschaubild konnte nicht erstellt werden.');
        const blob = await (await fetch(dataUrl)).blob();
        const previewUrl = await uploadBlobToMediaLibrary(blob, {
          uploadSource: 'gruenerator-vorlage',
        });
        if (!previewUrl) throw new Error('Vorschaubild konnte nicht hochgeladen werden.');

        const res = await getContractsClient().userTemplates.fromCanvas({
          body: {
            canvasId,
            title: title.trim() || undefined,
            tags: parseTags(tagsRaw),
            preview_image_url: previewUrl,
            visibility,
          },
        });
        if (res.status !== 201) throw new Error('Speichern fehlgeschlagen.');
        setStatus(visibility === 'private' ? 'saved' : 'submitted');
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Fehler beim Speichern.');
      }
    },
    [canvasId, canvasType, initialState, title, tagsRaw]
  );

  const isDone = status === 'saved' || status === 'submitted';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Als Vorlage speichern</DialogTitle>
          <DialogDescription>
            Speichere dieses Sharepic als Vorlage für dich – oder reiche es für die öffentliche
            Vorlagen-Galerie ein.
          </DialogDescription>
        </DialogHeader>

        {isDone ? (
          <div className="space-y-2 py-sm">
            <div className="flex items-center gap-1.5 text-sm text-primary-600">
              <FiCheckCircle size={14} />
              <span>
                {status === 'saved'
                  ? 'Vorlage gespeichert.'
                  : 'Eingereicht — deine Vorlage wird geprüft.'}
              </span>
            </div>
            <p className="m-0 text-[11px] text-grey-500">
              Du findest sie unter{' '}
              <Link to="/vorlagen/meine" className="text-primary-600 hover:underline">
                Meine Vorlagen
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel der Vorlage"
              aria-label="Titel der Vorlage"
              className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary-500"
            />
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="Schlagwörter (mit Komma getrennt)"
              aria-label="Schlagwörter"
              className="w-full rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary-500"
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => void save('private')} disabled={status === 'saving'}>
                {status === 'saving' ? 'Wird gespeichert...' : 'Für mich speichern'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void save('submit')}
                disabled={status === 'saving'}
              >
                Zur Galerie einreichen
              </Button>
            </div>

            <p className="m-0 text-[11px] text-grey-500">
              Nur für dich sichtbar, bis du sie einreichst. Um sie mit einer Gruppe zu teilen, nutze
              den Teilen-Dialog.
            </p>

            {status === 'error' && error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
