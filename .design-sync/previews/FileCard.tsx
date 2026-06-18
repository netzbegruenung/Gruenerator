import { FileCard } from '@gruenerator/ui';

const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
  </svg>
);

const DocIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
  </svg>
);

// A single uploaded-file row card: icon, name, formatted size, remove button.
export function AudioUpload() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FileCard
        name="Rede_Klimaschutz_Plenarsitzung.mp3"
        size={18_350_080}
        icon={<MicIcon />}
        onRemove={() => {}}
      />
    </div>
  );
}

// A list of file cards covering size formatting (KB / MB) and remove state.
export function UploadList() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
      <FileCard
        name="Wahlprogramm_2025_Entwurf.pdf"
        size={2_415_919}
        icon={<DocIcon />}
        onRemove={() => {}}
      />
      <FileCard
        name="Pressemitteilung_Wärmewende.docx"
        size={48_640}
        icon={<DocIcon />}
        onRemove={() => {}}
      />
    </div>
  );
}

// Read-only variant: no icon, no remove button (attachment display).
export function PlainAttachment() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FileCard name="Antrag_Solaroffensive_final.pdf" size={734_003} />
    </div>
  );
}
