import { DOCUMENT_UPLOAD_EXTENSIONS } from '@gruenerator/contracts';
import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
import { Button } from '@gruenerator/ui';
import { type Ref, useImperativeHandle, useRef, useState } from 'react';
import { PiPaperclip } from 'react-icons/pi';

import { useDocumentsStore } from '../../../stores/documentsStore';

interface ProjectFileUploadButtonProps {
  groupId: string;
  /** Called with the number of files that made it into the project. */
  onAdded: (count: number) => void;
  onError: (message: string) => void;
  /** Without the own button: the picker is opened through `ref` (the „Hinzufügen" menu). */
  hideTrigger?: boolean;
  ref?: Ref<ProjectFileUploadHandle>;
  onBusyChange?: (busy: boolean) => void;
}

export interface ProjectFileUploadHandle {
  open: () => void;
}

/**
 * „Datei hinzufügen": lädt die Datei in die Dokumente der Person und teilt sie
 * im selben Zug ins Projekt (contentType `documents`). Eingelesen wird im
 * Hintergrund — Projekt-Chats nutzen eine Datei, sobald sie fertig ist.
 */
export function ProjectFileUploadButton({
  groupId,
  onAdded,
  onError,
  hideTrigger = false,
  ref,
  onBusyChange,
}: ProjectFileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const uploadFileOnly = useDocumentsStore((s) => s.uploadFileOnly);

  useImperativeHandle(ref, () => ({ open: () => inputRef.current?.click() }), []);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    onBusyChange?.(true);
    let added = 0;
    let lastError: string | null = null;
    for (const file of files) {
      try {
        const doc = await uploadFileOnly(file);
        const res = await getContractsClient().groups.shareContent({
          params: { groupId },
          body: {
            contentType: 'documents',
            contentId: doc.id,
            permissions: { read: true, write: false, collaborative: false },
            note: null,
          },
        });
        if (res.status !== 200) {
          throw apiErrorFromResponse(res, 'Datei konnte nicht geteilt werden.');
        }
        added += 1;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Datei konnte nicht hinzugefügt werden.';
      }
    }
    setBusy(false);
    onBusyChange?.(false);
    if (added > 0) onAdded(added);
    if (lastError) onError(lastError);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        aria-label="Dateien für das Projekt auswählen"
        accept={DOCUMENT_UPLOAD_EXTENSIONS.join(',')}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (inputRef.current) inputRef.current.value = '';
          void handleFiles(files);
        }}
      />
      {!hideTrigger && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="max-sm:size-9 max-sm:rounded-full max-sm:p-0"
        >
          <PiPaperclip aria-hidden />
          <span className="max-sm:sr-only">{busy ? 'Wird hochgeladen …' : 'Datei hinzufügen'}</span>
        </Button>
      )}
    </>
  );
}
