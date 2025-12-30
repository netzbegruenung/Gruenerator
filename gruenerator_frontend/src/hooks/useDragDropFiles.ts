import { useDropzone } from 'react-dropzone';

const DEFAULT_ACCEPT = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};

export const VIDEO_ACCEPT = {
  'video/*': ['.mp4', '.mov', '.avi', '.mkv']
};

export const useDragDropFiles = ({
  onFilesAccepted,
  accept = DEFAULT_ACCEPT,
  multiple = true,
  disabled = false,
  noClick = true,
  noKeyboard = true
}) => {
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
