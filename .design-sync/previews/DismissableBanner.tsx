import { DismissableBanner } from '@gruenerator/ui';

// DismissableBanner: same tinted banner surface as StatusBanner, but with a
// persistent close button (top-right X). Requires a `storageKey` (localStorage
// dismiss key) — once dismissed it stays hidden, so each cell uses a fresh key.
// Cell 1 sweeps the tones with the close affordance; cell 2 is a realistic
// feature-warning banner mirroring the agent-creator usage.

const row: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxWidth: 560,
};

export function Tonvarianten() {
  return (
    <div style={row}>
      <DismissableBanner storageKey="ds-preview-info" variant="info">
        Neu: Du kannst Pressemitteilungen jetzt direkt aus dem Editor planen und vorab terminieren.
      </DismissableBanner>
      <DismissableBanner storageKey="ds-preview-success" variant="success">
        Deine Verbindung zu Mastodon wurde erfolgreich eingerichtet.
      </DismissableBanner>
      <DismissableBanner storageKey="ds-preview-warning" variant="warning">
        Dein Mitgliedszugang läuft in 14 Tagen ab. Bitte verlängere ihn rechtzeitig.
      </DismissableBanner>
    </div>
  );
}

export function FeatureHinweis() {
  return (
    <div style={{ maxWidth: 560 }}>
      <DismissableBanner storageKey="ds-preview-experimental" variant="warning">
        <strong>Experimentelles Feature</strong> — Eigene Agent*innen sind noch in der Erprobung.
        Verhalten und Funktionen können sich ändern, und nicht alles funktioniert schon zuverlässig.
      </DismissableBanner>
    </div>
  );
}
