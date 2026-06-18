import { MultiStepForm, Input, Label, Button } from '@gruenerator/ui';

// MultiStepForm renders the ACTIVE step (by `currentStep`) plus a header
// (back arrow + title/subtitle from the step's props) and step-dot indicators.
// Children must be `MultiStepForm.Step` elements — the component filters by type.
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };

// Second step active (currentStep=1) so the back arrow and a filled-in step dot
// both show. onBack is a no-op for the static preview.
export function KampagneAssistent() {
  return (
    <div style={{ maxWidth: 420 }}>
      <MultiStepForm currentStep={1} onBack={() => {}}>
        <MultiStepForm.Step title="Zielgruppe" subtitle="Wen möchtest du erreichen?">
          <div style={field}>
            <Label>Region</Label>
            <Input defaultValue="Wahlkreis 12 – Innenstadt" />
          </div>
        </MultiStepForm.Step>
        <MultiStepForm.Step title="Botschaft" subtitle="Schritt 2 von 3">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={field}>
              <Label>Titel der Kampagne</Label>
              <Input defaultValue="Mehr Bus & Bahn für die Region" />
            </div>
            <div style={field}>
              <Label>Kernforderung</Label>
              <Input defaultValue="Den Nahverkehr im 20-Minuten-Takt" />
            </div>
            <Button variant="brand">Weiter zu den Kanälen</Button>
          </div>
        </MultiStepForm.Step>
        <MultiStepForm.Step title="Kanäle" subtitle="Wo wird gepostet?">
          <div style={field}>
            <Label>Plattformen</Label>
            <Input defaultValue="Instagram, Newsletter" />
          </div>
        </MultiStepForm.Step>
      </MultiStepForm>
    </div>
  );
}

// First step active (currentStep=0) — no back arrow, first dot highlighted.
export function ErsterSchritt() {
  return (
    <div style={{ maxWidth: 420 }}>
      <MultiStepForm currentStep={0}>
        <MultiStepForm.Step title="Antrag erstellen" subtitle="Schritt 1 von 2">
          <div style={field}>
            <Label>Titel des Antrags</Label>
            <Input defaultValue="Radwegenetz bis 2030 ausbauen" />
          </div>
        </MultiStepForm.Step>
        <MultiStepForm.Step title="Begründung" subtitle="Schritt 2 von 2">
          <Input defaultValue="…" />
        </MultiStepForm.Step>
      </MultiStepForm>
    </div>
  );
}
