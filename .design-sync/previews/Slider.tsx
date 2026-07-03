import { Slider, Label } from '@gruenerator/ui';

// Slider is Radix range: defaultValue array (1 thumb = single, 2 = range),
// min / max / step, disabled. Track fill is Eucalyptus green.

const field: React.CSSProperties = { display: 'grid', gap: 10, maxWidth: 340 };
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 340 };

// Single-thumb default — e.g. a campaign budget weighting.
export function Single() {
  return (
    <div style={field}>
      <Label htmlFor="budget">Budget-Gewichtung Klimathemen</Label>
      <Slider id="budget" defaultValue={[65]} max={100} step={1} />
    </div>
  );
}

// Two-thumb range with a step — an age band for newsletter targeting.
export function Range() {
  return (
    <div style={field}>
      <Label htmlFor="alter">Zielgruppe nach Alter</Label>
      <Slider id="alter" defaultValue={[25, 55]} min={16} max={80} step={5} />
    </div>
  );
}

// Default vs. disabled.
export function States() {
  return (
    <div style={col}>
      <Slider defaultValue={[40]} max={100} step={1} />
      <Slider defaultValue={[40]} max={100} step={1} disabled />
    </div>
  );
}
