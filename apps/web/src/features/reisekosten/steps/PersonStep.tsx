import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, TextInput } from '../ui';

import type { ReisekostenState } from '@gruenerator/contracts';

export function PersonStep({
  state,
  setStammdaten,
}: {
  state: ReisekostenState;
  setStammdaten: (p: Partial<ReisekostenState['stammdaten']>) => void;
}) {
  const s = state.stammdaten;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Antragsteller*in</CardTitle>
        <CardDescription>Kontaktdaten und Bankverbindung für die Erstattung</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-md">
          <Field label="Name *">
            <TextInput value={s.name} onChange={(v) => setStammdaten({ name: v })} />
          </Field>
          <div className="grid grid-cols-[1fr_96px] gap-md">
            <Field label="Straße *">
              <TextInput value={s.strasse} onChange={(v) => setStammdaten({ strasse: v })} />
            </Field>
            <Field label="Nr.">
              <TextInput value={s.hausnr} onChange={(v) => setStammdaten({ hausnr: v })} />
            </Field>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-md">
            <Field label="PLZ *">
              <TextInput
                value={s.plz}
                onChange={(v) => setStammdaten({ plz: v })}
                inputMode="numeric"
              />
            </Field>
            <Field label="Ort *">
              <TextInput value={s.ort} onChange={(v) => setStammdaten({ ort: v })} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            <Field label="E-Mail *">
              <TextInput
                type="email"
                value={s.email}
                onChange={(v) => setStammdaten({ email: v })}
              />
            </Field>
            <Field label="Telefon">
              <TextInput
                type="tel"
                value={s.telefon ?? ''}
                onChange={(v) => setStammdaten({ telefon: v })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-md sm:grid-cols-[1fr_140px]">
            <Field label="IBAN *" hint="Wird nur lokal in deinem Browser gespeichert.">
              <TextInput
                value={s.iban}
                onChange={(v) => setStammdaten({ iban: v })}
                placeholder="DE00 0000 0000 0000 0000 00"
              />
            </Field>
            <Field label="BIC">
              <TextInput value={s.bic ?? ''} onChange={(v) => setStammdaten({ bic: v })} />
            </Field>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
