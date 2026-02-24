import { useState, useCallback } from 'react';

import { prepareFilesForSubmission } from '../../../../utils/fileAttachmentUtils';

interface UseFormAttachmentsReturn {
  attachedFiles: unknown[];
  processedAttachments: unknown[];
  handleAttachmentClick: (files: File[]) => Promise<void>;
  handleRemoveFile: (index: number) => void;
}

const useFormAttachments = (generatorType: string | null): UseFormAttachmentsReturn => {
  const [attachedFiles, setAttachedFiles] = useState<unknown[]>([]);
  const [processedAttachments, setProcessedAttachments] = useState<unknown[]>([]);

  const handleAttachmentClick = useCallback(
    async (files: File[]) => {
      if (!generatorType) return;
      try {
        const processed = await prepareFilesForSubmission(files);
        setAttachedFiles((prev) => [...prev, ...files]);
        setProcessedAttachments((prev) => [...prev, ...processed]);
      } catch (error: unknown) {
        console.error(`[${generatorType}] File processing error:`, error);
      }
    },
    [generatorType]
  );

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    setProcessedAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return { attachedFiles, processedAttachments, handleAttachmentClick, handleRemoveFile };
};

export default useFormAttachments;
