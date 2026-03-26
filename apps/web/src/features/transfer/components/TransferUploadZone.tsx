import { UploadZone, type Accept } from '@gruenerator/ui';
import { PiUploadSimple } from 'react-icons/pi';

const TRANSFER_ACCEPT: Accept = {
  'application/pdf': ['.pdf'],
  'application/zip': ['.zip'],
  'application/x-rar-compressed': ['.rar'],
  'application/x-7z-compressed': ['.7z'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-m4a': ['.m4a'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
};

interface TransferUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export default function TransferUploadZone({ onFilesSelected, disabled }: TransferUploadZoneProps) {
  return (
    <UploadZone
      onFilesSelected={onFilesSelected}
      accept={TRANSFER_ACCEPT}
      maxSizeMB={100}
      multiple
      disabled={disabled}
      icon={<PiUploadSimple className="size-8" />}
      title="Dateien auswählen oder hierher ziehen"
      subtitle="PDF, Office, Bilder, Videos, Audio, ZIP — bis 100 MB"
    />
  );
}
