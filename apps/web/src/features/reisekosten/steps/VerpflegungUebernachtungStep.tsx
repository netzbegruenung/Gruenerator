import BelegUpload from '../BelegUpload';
import { BelegStatus } from '../components/BelegStatus';
import { BreakdownRow } from '../components/BreakdownRow';
import { MealChip } from '../components/MealChip';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  NumberInput,
  Select,
  Switch,
} from '../ui';
import { latestBeleg } from '../utils/beleg';
import { eur } from '../utils/format';

import type { ComputeResult, ExtractBelegResponse, ReisekostenState } from '@gruenerator/contracts';

export function VerpflegungUebernachtungStep({
  state,
  belege,
  update,
  onToggle,
  onBeleg,
  computed,
}: {
  state: ReisekostenState;
  belege: ExtractBelegResponse[];
  update: (patch: (s: ReisekostenState) => ReisekostenState) => void;
  onToggle: (
    datum: string,
    patch: { fruehstueck?: boolean; mittagessen?: boolean; abendessen?: boolean }
  ) => void;
  onBeleg: (b: ExtractBelegResponse) => void;
  computed: ComputeResult;
}) {
  const hasZeitraum = !!state.reise.reisebeginn && !!state.reise.rueckkehr;
  const tage = computed.verpflegung.tage;
  const satzGesamt = tage.reduce((acc, t) => acc + t.basis, 0);
  const abzug = tage.reduce((acc, t) => acc + t.abzug, 0);
  const anAb = tage.filter((t) => t.typ === 'anreise' || t.typ === 'abreise');
  const voll = tage.filter((t) => t.typ === 'zwischen');
  const eintaegig = tage.filter((t) => t.typ === 'eintaegig');

  const u = state.uebernachtung;
  const setU = (patch: Partial<NonNullable<ReisekostenState['uebernachtung']>>) =>
    update((s) => ({
      ...s,
      uebernachtung: s.uebernachtung ? { ...s.uebernachtung, ...patch } : null,
    }));

  return (
    <div className="flex flex-col gap-lg">
      <Card>
        <CardHeader>
          <CardTitle>Verpflegungspauschale</CardTitle>
          <CardDescription>Wird automatisch aus dem Reisezeitraum berechnet</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasZeitraum ? (
            <div className="flex items-start gap-sm rounded-md bg-background-alt p-md text-sm text-muted-foreground">
              <span className="text-xl leading-none">🗓️</span>
              <span>
                Bitte zuerst in <strong className="text-foreground">1. Reise</strong> Reisebeginn
                und Rückkehr angeben – die Pauschale wird daraus automatisch berechnet.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-lg">
              <div className="flex flex-col gap-md rounded-lg border border-primary bg-primary-50 p-lg dark:bg-primary-900/30">
                <div className="flex items-baseline justify-between gap-md">
                  <span className="text-sm font-semibold text-primary-700">
                    Verpflegungspauschale
                  </span>
                  <span className="text-3xl font-bold leading-none tabular-nums text-primary-700">
                    {eur(computed.verpflegung.summe)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-lg gap-y-xs text-sm text-primary-700">
                  <span>{eur(satzGesamt)} Anspruch</span>
                  <span>−</span>
                  <span>{eur(abzug)} gestellte Mahlzeiten</span>
                </div>
              </div>

              <div className="flex flex-col">
                {eintaegig.length > 0 && (
                  <BreakdownRow
                    emoji="🕗"
                    label={
                      eintaegig[0].basis > 0
                        ? 'Eintägige Reise (> 8 Std)'
                        : 'Eintägige Reise (≤ 8 Std – kein Anspruch)'
                    }
                    value={eintaegig.reduce((a, t) => a + t.basis, 0)}
                  />
                )}
                {anAb.length > 0 && (
                  <BreakdownRow
                    emoji="🚉"
                    label={`${anAb.length} An-/Abreisetag(e) × ${eur(anAb[0].basis)}`}
                    value={anAb.reduce((a, t) => a + t.basis, 0)}
                  />
                )}
                {voll.length > 0 && (
                  <BreakdownRow
                    emoji="📅"
                    label={`${voll.length} volle(r) Reisetag(e) × ${eur(voll[0].basis)}`}
                    value={voll.reduce((a, t) => a + t.basis, 0)}
                  />
                )}
              </div>

              <div className="flex flex-col gap-sm">
                <span className="text-sm font-semibold">Gestellte Mahlzeiten abziehen</span>
                <span className="text-xs text-muted-foreground">
                  Mahlzeiten, die z. B. vom Veranstalter gestellt wurden, werden von der Pauschale
                  abgezogen.
                </span>
                <div className="mt-xs flex flex-col gap-sm">
                  {tage.map((t) => {
                    const abz = state.verpflegungAbzuege.find((a) => a.datum === t.datum);
                    return (
                      <div
                        key={t.datum}
                        className="flex flex-col gap-sm rounded-md border border-border p-md sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">{t.datum}</span>
                          <span className="text-xs text-muted-foreground">
                            {eur(t.summe)}
                            {t.abzug ? ` (−${eur(t.abzug)})` : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-xs">
                          <MealChip
                            emoji="🥐"
                            label="Frühstück"
                            active={abz?.fruehstueck ?? false}
                            onClick={() =>
                              onToggle(t.datum, { fruehstueck: !(abz?.fruehstueck ?? false) })
                            }
                          />
                          <MealChip
                            emoji="🍽️"
                            label="Mittag"
                            active={abz?.mittagessen ?? false}
                            onClick={() =>
                              onToggle(t.datum, { mittagessen: !(abz?.mittagessen ?? false) })
                            }
                          />
                          <MealChip
                            emoji="🌙"
                            label="Abend"
                            active={abz?.abendessen ?? false}
                            onClick={() =>
                              onToggle(t.datum, { abendessen: !(abz?.abendessen ?? false) })
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Übernachtung</CardTitle>
          <CardDescription>Optional – nur bei mehrtägigen Reisen</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-md">
            <label className="flex cursor-pointer items-center gap-sm text-sm font-semibold">
              <Switch
                checked={u !== null}
                onChange={(on) =>
                  update((s) => ({
                    ...s,
                    uebernachtung: on ? { modus: 'pauschal', betrag: null, naechte: 1 } : null,
                  }))
                }
              />
              Übernachtung anfügen
            </label>
            {u && (
              <>
                <Field label="Art">
                  <Select
                    value={u.modus}
                    onChange={(v) =>
                      setU({ modus: v as NonNullable<ReisekostenState['uebernachtung']>['modus'] })
                    }
                    options={[
                      { value: 'pauschal', label: 'Pauschal (20 €/Nacht, privat)' },
                      { value: 'beleg', label: 'Laut Beleg' },
                      { value: 'lv_bezahlt', label: 'Vom Landesverband bezahlt' },
                    ]}
                  />
                </Field>
                {u.modus === 'pauschal' && (
                  <Field label="Nächte *">
                    <NumberInput
                      value={u.naechte}
                      step="1"
                      placeholder="0"
                      onChange={(v) => setU({ naechte: v })}
                    />
                  </Field>
                )}
                {u.modus === 'beleg' && (
                  <>
                    <Field label="Betrag lt. Beleg (€) *">
                      <NumberInput value={u.betrag} onChange={(v) => setU({ betrag: v })} />
                    </Field>
                    <Field label="Hotelrechnung">
                      <BelegUpload
                        belegType="hotel"
                        title="Hotelrechnung hochladen"
                        onExtracted={(b) => {
                          onBeleg(b);
                          setU({ betrag: b.betrag ?? u.betrag });
                        }}
                      />
                    </Field>
                    <BelegStatus
                      beleg={latestBeleg(belege, 'hotel')}
                      confirmed={false}
                      hasBetrag={(u.betrag ?? 0) > 0}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
