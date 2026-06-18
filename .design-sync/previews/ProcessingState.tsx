import { ProcessingState } from '@gruenerator/ui';

// ProcessingState: centred processing block — an animated circular gauge
// (renders the % ring + number statically), a label, and an optional
// StepBreadcrumb wizard trail (steps + activeStepIndex). Mirrors the
// transcription pipeline usage ("Wird hochgeladen / extrahiert").
// Cell 1: gauge + label + step trail. Cell 2: a higher-progress finishing state.

const card: React.CSSProperties = {
  width: 360,
  border: '1px solid var(--grey-200)',
  borderRadius: 12,
  background: 'var(--background)',
};

export function MitFortschritt() {
  return (
    <div style={card}>
      <ProcessingState
        progress={42}
        label="Audio wird extrahiert"
        steps={[{ label: 'Hochladen' }, { label: 'Extrahieren' }, { label: 'Transkribieren' }]}
        activeStepIndex={1}
      />
    </div>
  );
}

export function KurzVorAbschluss() {
  return (
    <div style={card}>
      <ProcessingState
        progress={88}
        label="Transkription wird fertiggestellt"
        steps={[{ label: 'Hochladen' }, { label: 'Transkribieren', suffix: '(läuft)' }]}
        activeStepIndex={1}
      />
    </div>
  );
}
