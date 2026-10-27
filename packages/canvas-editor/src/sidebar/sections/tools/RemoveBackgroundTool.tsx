import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { useUserUploads } from '@ggraphic/editor/sidebar/UserUploadsProvider';
import { useCallback, useState } from 'react';
import { HiScissors } from 'react-icons/hi2';

import { ImageInputPicker } from './ImageInputPicker';
import { ToolPanel, type ToolPanelSuccess } from './ToolPanel';

export interface RemoveBackgroundToolProps {
  onJumpToUploads?: () => void;
}

export function RemoveBackgroundTool({ onJumpToUploads }: RemoveBackgroundToolProps) {
  const t = useMessages();
  const { removeBackgroundFromImage } = useCanvasEditorServices();
  const { upload, isUploading } = useUserUploads();

  const [input, setInput] = useState<File | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ToolPanelSuccess | null>(null);

  const handleAction = useCallback(async () => {
    if (!input || !removeBackgroundFromImage) return;

    setError(null);
    setSuccess(null);
    setIsBusy(true);
    setProgressMessage(t.sidebar.tools.optimizing);

    try {
      const { file } = await removeBackgroundFromImage(input, (p) => setProgressMessage(p.message));
      setProgressMessage(t.sidebar.tools.savingToUploads);
      const item = await upload(file);
      if (!item) throw new Error(t.sidebar.uploadFailed);
      const objectUrl = URL.createObjectURL(file);
      setSuccess({
        thumbnailUrl: objectUrl,
        itemName: item.originalFilename ?? item.title ?? file.name,
        onJumpToUploads,
      });
      setInput(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.sidebar.tools.removeBgError;
      setError(message);
    } finally {
      setIsBusy(false);
      setProgressMessage(null);
    }
  }, [t, input, removeBackgroundFromImage, upload, onJumpToUploads]);

  if (!removeBackgroundFromImage) return null;

  return (
    <ToolPanel
      body={<ImageInputPicker value={input} onChange={setInput} disabled={isBusy || isUploading} />}
      actionLabel={t.sidebar.tools.removeBg}
      actionIcon={HiScissors}
      canSubmit={!!input}
      isBusy={isBusy || isUploading}
      progressMessage={progressMessage}
      error={error}
      success={success}
      onAction={() => void handleAction()}
    />
  );
}
