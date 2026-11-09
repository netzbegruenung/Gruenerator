import { ApiError, getContractsClient } from '@gruenerator/shared/api';
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

import { ShareVorlageBody } from '@/features/vorlagen/components/ShareVorlageDialog';

interface SaveAsTemplateDialogProps {
  canvasId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Template type + state used to render the template thumbnail. */
  canvasType: string;
  initialState: Record<string, unknown>;
  /** The canvas's format, so a 3:4 canvas gets a 3:4 thumbnail. */
  formatId?: string;
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
 * Saves privately first (the server snapshots the canvas into Meine Vorlagen),
 * then offers the Vorlage's share controls in place — sharing needs the saved
 * snapshot, so it can only come second. Submitting to the public gallery is a
 * separate, reviewed act that lives in Meine Vorlagen, not here.
 * Deliberately separate from ShareCanvasDialog: that one is about giving other
 * people access to *this* document, this one mints a new, frozen artefact.
 */
export function SaveAsTemplateDialog({
  canvasId,
  open,
  onOpenChange,
  canvasType,
  initialState,
  formatId,
  defaultTitle,
}: SaveAsTemplateDialogProps) {
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [tagsRaw, setTagsRaw] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Reopening after a save must offer a fresh form, not the previous success
  // message — a canvas can yield more than one template. Adjusted during render rather than in an effect so the reset
  // is visible on the first paint of the reopened dialog.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStatus('idle');
      setError(null);
      setSavedId(null);
    }
  }

  const save = useCallback(async () => {
    setStatus('saving');
    setError(null);
    try {
      // Prefer the freshest live state for the thumbnail; fall back to the
      // state passed in if the live read fails.
      let stateForThumb: Record<string, unknown> = initialState;
      let pageStates: Array<Record<string, unknown>> = [];
      try {
        const st = await getContractsClient().canvas.getState({ params: { id: canvasId } });
        if (st.status === 200) {
          stateForThumb = st.body.state;
          pageStates = st.body.pages ?? [];
        }
      } catch {
        /* fall back to initialState */
      }

      // A deck exposes every slide as `pages`; each needs its own preview, or
      // reviewers only ever see the cover of a carousel.
      const states = pageStates.length > 1 ? pageStates : [stateForThumb];

      const previewUrls: string[] = [];
      for (const state of states) {
        const dataUrl = await renderSharepicToImage(canvasType, state, {
          ...(formatId ? { formatId } : {}),
        });
        if (!dataUrl) throw new Error('Vorschaubild konnte nicht erstellt werden.');
        const blob = await (await fetch(dataUrl)).blob();
        const url = await uploadBlobToMediaLibrary(blob, { uploadSource: 'gruenerator-vorlage' });
        if (!url) throw new Error('Vorschaubild konnte nicht hochgeladen werden.');
        previewUrls.push(url);
      }

      const res = await getContractsClient().userTemplates.fromCanvas({
        body: {
          canvasId,
          title: title.trim() || undefined,
          tags: parseTags(tagsRaw),
          preview_image_url: previewUrls[0]!,
          images: previewUrls.map((url, i) => ({ url, display_order: i })),
          visibility: 'private',
        },
      });
      if (res.status !== 201) throw new ApiError(res.status, 'Speichern fehlgeschlagen.');
      setSavedId(res.body.data.id);
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    }
  }, [canvasId, canvasType, initialState, formatId, title, tagsRaw]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{savedId ? 'Vorlage teilen' : 'Als Vorlage speichern'}</DialogTitle>
          <DialogDescription>
            {savedId
              ? 'Teile deine neue Vorlage. Wer sie öffnet, kann sich eine eigene Kopie erstellen.'
              : 'Speichere dieses Sharepic als Vorlage für dich. Danach kannst du sie teilen.'}
          </DialogDescription>
        </DialogHeader>

        {savedId ? (
          <div className="flex flex-col gap-md">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-sm text-primary-600">
                <FiCheckCircle size={14} aria-hidden />
                <span>Vorlage gespeichert.</span>
              </div>
              <p className="m-0 text-xs text-grey-500">
                Du findest sie unter{' '}
                <Link to="/vorlagen?cat=meine" className="text-primary-600 hover:underline">
                  Meine Vorlagen
                </Link>
                .
              </p>
            </div>
            <ShareVorlageBody
              title={title.trim() || defaultTitle || 'Vorlage'}
              templateId={savedId}
            />
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

            <div className="pt-1">
              <Button size="sm" onClick={() => void save()} disabled={status === 'saving'}>
                {status === 'saving' ? 'Wird gespeichert...' : 'Für mich speichern'}
              </Button>
            </div>

            {status === 'error' && error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
