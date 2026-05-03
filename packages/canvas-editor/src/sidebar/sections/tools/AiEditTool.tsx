import { useCallback, useState } from 'react';
import { HiPencilSquare } from 'react-icons/hi2';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { useUserUploads } from '../../UserUploadsProvider';

import { ImageInputPicker } from './ImageInputPicker';
import { ToolPanel, type ToolPanelSuccess } from './ToolPanel';

const MIN_INSTRUCTION_LENGTH = 15;
const MAX_INSTRUCTION_LENGTH = 500;

export interface AiEditToolProps {
  onJumpToUploads?: () => void;
}

export function AiEditTool({ onJumpToUploads }: AiEditToolProps) {
  const { editAiImage } = useCanvasEditorServices();
  const { upload, isUploading } = useUserUploads();

  const [input, setInput] = useState<File | null>(null);
  const [instruction, setInstruction] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ToolPanelSuccess | null>(null);

  const handleAction = useCallback(async () => {
    if (!input || !editAiImage) return;
    setError(null);
    setSuccess(null);
    setIsBusy(true);
    setProgressMessage('Bild wird bearbeitet…');

    try {
      const { file, objectUrl } = await editAiImage(input, instruction.trim());
      setProgressMessage('Speichern in Uploads…');
      const item = await upload(file);
      if (!item) throw new Error('Upload fehlgeschlagen');
      setSuccess({
        thumbnailUrl: objectUrl,
        itemName: item.originalFilename ?? item.title ?? file.name,
        onJumpToUploads,
      });
      setInput(null);
      setInstruction('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Bearbeiten';
      setError(message);
    } finally {
      setIsBusy(false);
      setProgressMessage(null);
    }
  }, [input, editAiImage, instruction, upload, onJumpToUploads]);

  if (!editAiImage) return null;

  const canSubmit = !!input && instruction.trim().length >= MIN_INSTRUCTION_LENGTH;

  return (
    <ToolPanel
      body={
        <>
          <ImageInputPicker value={input} onChange={setInput} disabled={isBusy || isUploading} />
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='Bearbeitungsanweisung (z.B. "Ersetze den Himmel durch einen Sonnenuntergang")'
            rows={3}
            maxLength={MAX_INSTRUCTION_LENGTH}
            disabled={isBusy || isUploading}
            className="w-full p-3 bg-background border border-[var(--font-color)] rounded-lg text-foreground text-sm outline-none resize-none focus:border-primary-600 disabled:opacity-50"
          />
          <p className="m-0 text-[10px] text-foreground-muted">
            Mindestens {MIN_INSTRUCTION_LENGTH} Zeichen — je präziser die Anweisung, desto besser
            das Ergebnis.
          </p>
        </>
      }
      actionLabel="Bearbeiten"
      actionIcon={HiPencilSquare}
      canSubmit={canSubmit}
      isBusy={isBusy || isUploading}
      progressMessage={progressMessage}
      error={error}
      success={success}
      onAction={() => void handleAction()}
    />
  );
}
