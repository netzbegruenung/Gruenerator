import { VERANSTALTUNGEN } from '@gruenerator/shared/reisekosten';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Select,
  TextInput,
} from '../ui';

import type { ReisekostenState } from '@gruenerator/contracts';

export function ReiseStep({
  state,
  setReise,
}: {
  state: ReisekostenState;
  setReise: (p: Partial<ReisekostenState['reise']>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reise</CardTitle>
        <CardDescription>Anlass, Ziel und Zeitraum der Dienstreise</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-md">
          <Field label="Veranstaltung (Vorlage)" hint="Füllt Anlass und Ziel automatisch aus.">
            <Select
              value=""
              onChange={(id) => {
                const v = VERANSTALTUNGEN.find((x) => x.id === id);
                if (v) setReise({ anlass: v.anlass, ziel: v.ziel });
              }}
              options={[
                { value: '', label: '– auswählen –' },
                ...VERANSTALTUNGEN.map((v) => ({ value: v.id, label: v.label })),
              ]}
            />
          </Field>
          <Field label="Anlass der Reise *">
            <TextInput
              value={state.reise.anlass}
              onChange={(v) => setReise({ anlass: v })}
              placeholder="z. B. Länderrat"
            />
          </Field>
          <Field label="Ziel der Reise *">
            <TextInput
              value={state.reise.ziel}
              onChange={(v) => setReise({ ziel: v })}
              placeholder="Anschrift"
            />
          </Field>
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            <Field label="Reisebeginn *">
              <TextInput
                type="datetime-local"
                value={state.reise.reisebeginn}
                onChange={(v) => setReise({ reisebeginn: v })}
              />
            </Field>
            <Field label="Rückkehr *">
              <TextInput
                type="datetime-local"
                value={state.reise.rueckkehr}
                onChange={(v) => setReise({ rueckkehr: v })}
              />
            </Field>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
