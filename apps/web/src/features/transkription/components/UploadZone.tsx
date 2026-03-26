import { UploadZone as BaseUploadZone, type Accept } from '@gruenerator/ui';
import { PiMicrophone } from 'react-icons/pi';

const MEDIA_ACCEPT: Accept = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-m4a': ['.m4a'],
  'audio/aac': ['.aac'],
  'audio/ogg': ['.ogg'],
  'audio/webm': ['.webm'],
  'audio/flac': ['.flac'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/webm': ['.webm'],
};

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  onHoverChange?: (hovering: boolean) => void;
}

export default function UploadZone({ onFileSelected, disabled, onHoverChange }: UploadZoneProps) {
  return (
    <BaseUploadZone
      onFileSelected={onFileSelected}
      accept={MEDIA_ACCEPT}
      maxSizeMB={500}
      disabled={disabled}
      variant="minimal"
      icon={<PiMicrophone className="size-10 max-md:size-8" />}
      title=""
      subtitle=""
      onHoverChange={onHoverChange}
    />
  );
}
