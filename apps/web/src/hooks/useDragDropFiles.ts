import { useDropzone, Accept } from 'react-dropzone';

const DEFAULT_ACCEPT: Accept = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};

export const VIDEO_ACCEPT: Accept = {
  'video/*': ['.mp4', '.mov', '.avi', '.mkv']
};

interface UseDragDropFilesOptions {
  onFilesAccepted: (files: File[]) => void;
  accept?: Accept;
  multiple?: boolean;
  disabled?: boolean;
  noClick?: boolean;
  noKeyboard?: boolean;
}

export const useDragDropFiles = ({
  onFilesAccepted,
  accept = DEFAULT_ACCEPT,
  multiple = true,
  disabled = false,
  noClick = true,
  noKeyboard = true
}: UseDragDropFilesOptions) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFilesAccepted,
    accept,
    multiple,
    disabled,
    noClick,
    noKeyboard
  });

  return { getRootProps, getInputProps, isDragActive };
};

export default useDragDropFiles;
