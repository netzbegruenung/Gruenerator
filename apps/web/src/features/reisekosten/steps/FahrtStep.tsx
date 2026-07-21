import { getRate } from '@gruenerator/shared/reisekosten';

import BelegUpload from '../BelegUpload';
import { BelegStatus } from '../components/BelegStatus';
import { DetailBox } from '../components/DetailBox';
import { MODE_TILES } from '../constants';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  NumberInput,
  Select,
  TextInput,
} from '../ui';
import { latestBeleg } from '../utils/beleg';

import type { ExtractBelegResponse, ReisekostenState } from '@gruenerator/contracts';

export function FahrtStep({
  state,
  belege,
  update,
  onBeleg,
}: {
  state: ReisekostenState;
  belege: ExtractBelegResponse[];
  update: (patch: (s: ReisekostenState) => ReisekostenState) => void;
  onBeleg: (b: ExtractBelegResponse) => void;
}) {
  const f = state.fahrt;
  const kmObergrenze = getRate(state.rateKey).kmObergrenze;
  const setFahrt = (patch: Partial<ReisekostenState['fahrt']>) =>
    update((s) => ({ ...s, fahrt: { ...s.fahrt, ...patch } }));

  const toggle = (key: (typeof MODE_TILES)[number]['key']) => {
    switch (key) {
      case 'bahn':
        return setFahrt({ bahn: f.bahn ? null : { betrag: 0, belegVorhanden: false } });
      case 'oepnv':
        return setFahrt({ oepnv: f.oepnv ? null : { betrag: 0, belegVorhanden: false } });
      case 'kfz':
        return setFahrt({
          kfz: f.kfz
            ? null
            : { km: 0, fahrzeug: 'pkw', routenplanerVorhanden: false, dbFlexpreis: null },
        });
      case 'miete':
        return setFahrt({
          miete: f.miete ? null : { betrag: 0, dbFlexpreis: null, belegVorhanden: false },
        });
      case 'taxi':
        return setFahrt({
          taxi: f.taxi ? null : { betrag: 0, begruendung: '', belegVorhanden: false },
        });
      case 'sonstiges':
        return setFahrt({ sonstiges: f.sonstiges ? null : { betrag: 0, beschreibung: '' } });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fahrtkosten</CardTitle>
        <CardDescription>
          Verkehrsmittel wählen und Rechnung hochladen – wir lesen Betrag und Daten automatisch aus.
          Für Bahn, ÖPNV und Mietwagen ist ein Beleg erforderlich.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-lg">
          <div className="grid grid-cols-2 gap-md sm:grid-cols-3">
            {MODE_TILES.map((m) => {
              const active = f[m.key] !== null;
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(m.key)}
                  className={`flex min-h-[104px] flex-col items-center justify-center gap-xs rounded-lg p-md transition-all ${
                    active
                      ? 'bg-primary-50 text-primary-700 shadow-sm ring-2 ring-inset ring-primary dark:bg-primary-900'
                      : 'bg-background-alt text-foreground hover:bg-primary-50 dark:hover:bg-primary-900'
                  }`}
                >
                  <span className="text-3xl leading-none">{m.emoji}</span>
                  <span className="text-sm font-semibold">{m.label}</span>
                  {m.hint && <span className="text-xs text-muted-foreground">{m.hint}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-md">
            {f.bahn && (
              <DetailBox emoji="🚆" title="Bahn">
                <BelegUpload
                  belegType="bahn"
                  title="Bahnticket hochladen"
                  onExtracted={(b) => {
                    onBeleg(b);
                    setFahrt({
                      bahn: { betrag: b.betrag ?? f.bahn?.betrag ?? 0, belegVorhanden: true },
                    });
                  }}
                />
                <Field label="Betrag (€) *" hint="2. Klasse, BahnCard-Rabatt bereits abgezogen.">
                  <NumberInput
                    value={f.bahn.betrag || null}
                    onChange={(v) =>
                      setFahrt({ bahn: { betrag: v ?? 0, belegVorhanden: f.bahn!.belegVorhanden } })
                    }
                  />
                </Field>
                <Checkbox
                  label="Originalbeleg liegt vor"
                  checked={f.bahn.belegVorhanden}
                  onChange={(on) =>
                    setFahrt({ bahn: { betrag: f.bahn!.betrag, belegVorhanden: on } })
                  }
                />
                <BelegStatus
                  beleg={latestBeleg(belege, 'bahn')}
                  confirmed={f.bahn.belegVorhanden}
                  hasBetrag={f.bahn.betrag > 0}
                />
              </DetailBox>
            )}

            {f.oepnv && (
              <DetailBox emoji="🚋" title="ÖPNV">
                <BelegUpload
                  belegType="oepnv"
                  title="ÖPNV-Beleg hochladen"
                  onExtracted={(b) => {
                    onBeleg(b);
                    setFahrt({
                      oepnv: { betrag: b.betrag ?? f.oepnv?.betrag ?? 0, belegVorhanden: true },
                    });
                  }}
                />
                <Field label="Betrag (€) *">
                  <NumberInput
                    value={f.oepnv.betrag || null}
                    onChange={(v) =>
                      setFahrt({
                        oepnv: { betrag: v ?? 0, belegVorhanden: f.oepnv!.belegVorhanden },
                      })
                    }
                  />
                </Field>
                <BelegStatus
                  beleg={latestBeleg(belege, 'oepnv')}
                  confirmed={f.oepnv.belegVorhanden}
                  hasBetrag={f.oepnv.betrag > 0}
                />
              </DetailBox>
            )}

            {f.kfz && (
              <DetailBox emoji="🚗" title="Kfz (privater Pkw)">
                <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                  <Field
                    label="Kilometer (kürzeste Strecke) *"
                    hint="Routenplaner-Ausdruck beifügen."
                  >
                    <NumberInput
                      value={f.kfz.km || null}
                      step="1"
                      placeholder="0"
                      onChange={(v) => setFahrt({ kfz: { ...f.kfz!, km: v ?? 0 } })}
                    />
                  </Field>
                  <Field label="Fahrzeug">
                    <Select
                      value={f.kfz.fahrzeug}
                      onChange={(v) =>
                        setFahrt({ kfz: { ...f.kfz!, fahrzeug: v as 'pkw' | 'motorrad' } })
                      }
                      options={[
                        { value: 'pkw', label: 'Pkw (0,30 €/km)' },
                        { value: 'motorrad', label: 'Motorrad/Roller (0,20 €/km)' },
                      ]}
                    />
                  </Field>
                </div>
                <Checkbox
                  label="Routenplaner-Ausdruck liegt bei"
                  checked={f.kfz.routenplanerVorhanden}
                  onChange={(on) => setFahrt({ kfz: { ...f.kfz!, routenplanerVorhanden: on } })}
                />
                {f.kfz.km > kmObergrenze && (
                  <Field
                    label={`DB-Flexpreis 2. Kl. (Pflicht > ${kmObergrenze} km)`}
                    hint={`Ab ${kmObergrenze} km ist nur der DB-Flexpreis erstattungsfähig.`}
                  >
                    <NumberInput
                      value={f.kfz.dbFlexpreis}
                      onChange={(v) => setFahrt({ kfz: { ...f.kfz!, dbFlexpreis: v } })}
                    />
                  </Field>
                )}
              </DetailBox>
            )}

            {f.miete && (
              <DetailBox emoji="🚙" title="Mietwagen / Carsharing">
                <BelegUpload
                  belegType="miete"
                  title="Rechnung hochladen"
                  onExtracted={(b) => {
                    onBeleg(b);
                    setFahrt({
                      miete: {
                        ...f.miete!,
                        betrag: b.betrag ?? f.miete?.betrag ?? 0,
                        belegVorhanden: true,
                      },
                    });
                  }}
                />
                <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                  <Field label="Betrag (€) *">
                    <NumberInput
                      value={f.miete.betrag || null}
                      onChange={(v) => setFahrt({ miete: { ...f.miete!, betrag: v ?? 0 } })}
                    />
                  </Field>
                  <Field label="DB-Flexpreis (Obergrenze)">
                    <NumberInput
                      value={f.miete.dbFlexpreis}
                      onChange={(v) => setFahrt({ miete: { ...f.miete!, dbFlexpreis: v } })}
                    />
                  </Field>
                </div>
                <BelegStatus
                  beleg={latestBeleg(belege, 'miete')}
                  confirmed={f.miete.belegVorhanden}
                  hasBetrag={f.miete.betrag > 0}
                />
              </DetailBox>
            )}

            {f.taxi && (
              <DetailBox emoji="🚕" title="Taxi (Quittung + Begründung erforderlich)">
                <BelegUpload
                  belegType="taxi"
                  title="Taxi-Quittung hochladen"
                  onExtracted={(b) => {
                    onBeleg(b);
                    setFahrt({
                      taxi: {
                        ...f.taxi!,
                        betrag: b.betrag ?? f.taxi?.betrag ?? 0,
                        belegVorhanden: true,
                      },
                    });
                  }}
                />
                <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                  <Field label="Betrag (€) *">
                    <NumberInput
                      value={f.taxi.betrag || null}
                      onChange={(v) => setFahrt({ taxi: { ...f.taxi!, betrag: v ?? 0 } })}
                    />
                  </Field>
                  <Field label="Begründung *" hint="Taxi ist nur im Ausnahmefall erstattungsfähig.">
                    <TextInput
                      value={f.taxi.begruendung}
                      onChange={(v) => setFahrt({ taxi: { ...f.taxi!, begruendung: v } })}
                      placeholder="z. B. kein ÖPNV nach 23 Uhr"
                    />
                  </Field>
                </div>
                <BelegStatus
                  beleg={latestBeleg(belege, 'taxi')}
                  confirmed={f.taxi.belegVorhanden}
                  hasBetrag={f.taxi.betrag > 0}
                />
              </DetailBox>
            )}

            {f.sonstiges && (
              <DetailBox emoji="🧾" title="Sonstiges">
                <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                  <Field label="Betrag (€) *">
                    <NumberInput
                      value={f.sonstiges.betrag || null}
                      onChange={(v) => setFahrt({ sonstiges: { ...f.sonstiges!, betrag: v ?? 0 } })}
                    />
                  </Field>
                  <Field
                    label="Beschreibung *"
                    hint="z. B. Teilnahmebeitrag, Parkgebühr (keine Bewirtung)."
                  >
                    <TextInput
                      value={f.sonstiges.beschreibung}
                      onChange={(v) =>
                        setFahrt({ sonstiges: { ...f.sonstiges!, beschreibung: v } })
                      }
                    />
                  </Field>
                </div>
              </DetailBox>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
