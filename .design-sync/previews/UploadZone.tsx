import { UploadZone } from '@gruenerator/ui';

// UploadZone: react-dropzone drop target. Renders the idle state statically
// (the drag-active title only shows during an actual drag). Requires `accept`
// and a drop handler; `icon`/`title`/`subtitle` and the variant (default =
// dashed border card, minimal = borderless) drive the look.
// Cell 1: default dashed zone with an upload icon. Cell 2: minimal variant.

const UploadIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="28"
    height="28"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5" />
    <path d="M12 3v12" />
  </svg>
);

const frame: React.CSSProperties = { width: 460 };

export function Standard() {
  return (
    <div style={frame}>
      <UploadZone
        accept={{ 'audio/*': ['.mp3', '.wav', '.m4a'], 'video/*': ['.mp4', '.mov'] }}
        onFilesSelected={() => {}}
        icon={<UploadIcon />}
        title="Audio- oder Videodatei auswählen oder hierher ziehen"
        subtitle="MP3, WAV, MP4 · max. 100 MB"
        maxSizeMB={100}
      />
    </div>
  );
}

export function Minimal() {
  return (
    <div style={frame}>
      <UploadZone
        variant="minimal"
        accept={{ 'application/pdf': ['.pdf'] }}
        onFilesSelected={() => {}}
        icon={<UploadIcon />}
        title="Antrag als PDF hochladen"
        subtitle="Nur PDF · max. 25 MB"
        maxSizeMB={25}
      />
    </div>
  );
}
