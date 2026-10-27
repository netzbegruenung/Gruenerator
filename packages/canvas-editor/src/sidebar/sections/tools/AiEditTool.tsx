import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { useUserUploads } from '@ggraphic/editor/sidebar/UserUploadsProvider';
import { useCallback, useState } from 'react';
import { HiPencilSquare } from 'react-icons/hi2';

import { MOBILE_INPUT_TEXT } from '../../sidebarStyles';

import { ImageInputPicker } from './ImageInputPicker';
import { ToolPanel, type ToolPanelSuccess } from './ToolPanel';
import { useMessages } from '@ggraphic/editor/i18n/messages';

const MIN_INSTRUCTION_LENGTH = 15;
const MAX_INSTRUCTION_LENGTH = 500;

export interface AiEditToolProps {
  onJumpToUploads?: () => void;
}

export function AiEditTool({ onJumpToUploads }: AiEditToolProps) {
  const t = useMessages();
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
    setProgressMessage(t.sidebar.tools.editing);

    try {
      const { file, objectUrl } = await editAiImage(input, instruction.trim());
      setProgressMessage(t.sidebar.tools.savingToUploads);
      const item = await upload(file);
      if (!item) throw new Error(t.sidebar.uploadFailed);
      setSuccess({
        thumbnailUrl: objectUrl,
        itemName: item.originalFilename ?? item.title ?? file.name,
        onJumpToUploads,
      });
      setInput(null);
      setInstruction('');
    } catch (err) {
      const message = err instanceof Error ? err.message : t.sidebar.tools.editError;
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
            placeholder={t.sidebar.tools.editPlaceholder}
            rows={3}
            maxLength={MAX_INSTRUCTION_LENGTH}
            disabled={isBusy || isUploading}
            className={`w-full p-3 bg-background border border-[var(--font-color)] rounded-lg text-foreground text-sm ${MOBILE_INPUT_TEXT} outline-none resize-none focus:border-primary-600 disabled:opacity-50`}
          />
          <p className="m-0 text-[10px] text-foreground-muted">
            {t.sidebar.tools.minInstruction(MIN_INSTRUCTION_LENGTH)}
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
