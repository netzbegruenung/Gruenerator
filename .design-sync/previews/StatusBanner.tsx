import { StatusBanner } from '@gruenerator/ui';

// StatusBanner: full-width inline banner. The `variant` prop (info/success/
// warning/error) is the primary appearance axis — each maps to a tinted
// border/background/text colour. Content is free children.
// Cell 1 sweeps all four tones; cell 2 shows a richer banner with heading + body.

const row: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxWidth: 560,
};

export function Tonvarianten() {
  return (
    <div style={row}>
      <StatusBanner variant="info">
        Die Pressemitteilung wird gerade vom Presseverteiler übernommen. Das kann einige Minuten
        dauern.
      </StatusBanner>
      <StatusBanner variant="success">
        Newsletter erfolgreich an 1.248 Abonnent*innen versendet.
      </StatusBanner>
      <StatusBanner variant="warning">
        Der Veranstaltungstermin liegt in der Vergangenheit und wird nicht mehr öffentlich
        angezeigt.
      </StatusBanner>
      <StatusBanner variant="error">
        Der Antrag konnte nicht gespeichert werden. Bitte prüfe deine Verbindung und versuche es
        erneut.
      </StatusBanner>
    </div>
  );
}

export function MitÜberschrift() {
  return (
    <div style={{ maxWidth: 560 }}>
      <StatusBanner variant="warning">
        <strong>Kampagne noch nicht freigegeben.</strong> Bevor du die Kampagne „Klimaschutz vor
        Ort“ veröffentlichst, muss sie von der Landesgeschäftsstelle geprüft werden.
      </StatusBanner>
    </div>
  );
}
