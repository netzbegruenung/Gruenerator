import { PreviewImage } from '@gruenerator/ui';

// PreviewImage: lazy image that fades in on load (object-cover, fills its
// parent). It renders blank without a real `src`, so each cell points at a
// real image and sits inside an explicitly sized, rounded frame.
// Cell 1: a loaded image. Cell 2: the same image with a low-res `placeholder`
// painted on the wrapper background (visible while the full image streams in).

const frame: React.CSSProperties = {
  width: 320,
  height: 200,
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid var(--grey-200)',
  background: 'var(--grey-100)',
};

const caption: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--grey-400)',
  marginTop: 8,
};

export function Sharepic() {
  return (
    <div>
      <div style={frame}>
        <PreviewImage
          src="https://picsum.photos/seed/gruen-kampagne/480/300"
          alt="Vorschau des Sharepics zur Klimaschutz-Kampagne"
          width={480}
          height={300}
        />
      </div>
      <p style={caption}>Sharepic „Klimaschutz vor Ort“</p>
    </div>
  );
}

export function MitPlaceholder() {
  return (
    <div>
      <div style={frame}>
        <PreviewImage
          src="https://picsum.photos/seed/gruen-veranstaltung/480/300"
          placeholder="https://picsum.photos/seed/gruen-veranstaltung/48/30"
          alt="Vorschau des Veranstaltungsbilds"
          width={480}
          height={300}
        />
      </div>
      <p style={caption}>Veranstaltungsbild mit Vorschau-Placeholder</p>
    </div>
  );
}
