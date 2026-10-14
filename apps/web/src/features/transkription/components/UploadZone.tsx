import { MAX_VIDEO_UPLOAD_MB } from '@gruenerator/contracts';
import { UploadZone as BaseUploadZone, toast } from '@gruenerator/ui';
import { PiMicrophone } from 'react-icons/pi';

import { MEDIA_ACCEPT } from '../utils/mediaType';

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
      maxSizeMB={MAX_VIDEO_UPLOAD_MB}
      disabled={disabled}
      variant="minimal"
      icon={<PiMicrophone className="size-10 max-md:size-8" />}
      title=""
      subtitle=""
      onHoverChange={onHoverChange}
      // Without this the base zone drops a file of the wrong format silently.
      onError={(message: string) => toast.error(message)}
    />
  );
}
