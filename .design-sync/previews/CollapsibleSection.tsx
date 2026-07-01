import { CollapsibleSection } from '@gruenerator/ui';

// Bordered variant, open by default — title in a padded header, content below.
export function Bordered() {
  return (
    <div style={{ maxWidth: 460 }}>
      <CollapsibleSection title="Erweiterte Einstellungen" defaultOpen bordered>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Lege fest, wer diesen Antrag bearbeiten darf und ob Änderungen
            automatisch protokolliert werden.
          </p>
          <span style={{ opacity: 0.7 }}>Sichtbarkeit: Kreisverband · Zuletzt geändert: heute</span>
        </div>
      </CollapsibleSection>
    </div>
  );
}

// Borderless variant (muted text trigger with top divider), open by default.
export function Borderless() {
  return (
    <div style={{ maxWidth: 460 }}>
      <CollapsibleSection title="Weitere Details anzeigen" defaultOpen>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
          <li>Veröffentlicht am 18. Juni 2026</li>
          <li>Autor:in: Anna Berger</li>
          <li>Kategorie: Klimaschutz</li>
        </ul>
      </CollapsibleSection>
    </div>
  );
}
