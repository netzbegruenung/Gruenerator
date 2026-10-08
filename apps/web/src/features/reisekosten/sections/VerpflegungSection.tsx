import { FormSection } from '../components/FormSection';
import { HelpTip } from '../components/HelpTip';
import { MealChip } from '../components/MealChip';
import { eur } from '../utils/format';

import type { SectionWithTotalsProps } from './types';
import type { VerpflegungAbzug, VerpflegungTag } from '@gruenerator/contracts';

const TYP_LABEL: Record<VerpflegungTag['typ'], string> = {
  eintaegig: 'Eintägige Reise',
  anreise: 'Anreisetag',
  zwischen: 'Zwischentag',
  abreise: 'Abreisetag',
};

type Mahlzeit = 'fruehstueck' | 'mittagessen' | 'abendessen';

const MAHLZEITEN: ReadonlyArray<{ key: Mahlzeit; emoji: string; label: string }> = [
  { key: 'fruehstueck', emoji: '🥐', label: 'Frühstück' },
  { key: 'mittagessen', emoji: '🍽️', label: 'Mittag' },
  { key: 'abendessen', emoji: '🌙', label: 'Abend' },
];

function formatTag(datum: string): string {
  const d = new Date(`${datum}T12:00:00`);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function VerpflegungSection({
  state,
  update,
  computed,
}: Omit<SectionWithTotalsProps, 'belege'>) {
  const tage = computed.verpflegung.tage;

  const toggle = (datum: string, key: Mahlzeit) =>
    update((s) => {
      const base: VerpflegungAbzug = s.verpflegungAbzuege.find((a) => a.datum === datum) ?? {
        datum,
        fruehstueck: false,
        mittagessen: false,
        abendessen: false,
      };
      return {
        ...s,
        verpflegungAbzuege: [
          ...s.verpflegungAbzuege.filter((a) => a.datum !== datum),
          { ...base, [key]: !base[key] },
        ],
      };
    });

  return (
    <FormSection
      id="verpflegung"
      titel="2. Verpflegungsmehraufwand"
      hilfe="verpflegung"
      summe={eur(computed.verpflegung.summe)}
    >
      {tage.length === 0 ? (
        <p className="m-0 px-lg py-md text-sm text-grey-600 dark:text-grey-400">
          Wird aus Reisebeginn und Rückkehr berechnet – bitte oben eintragen.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-xs px-lg pt-sm text-xs text-grey-600 dark:text-grey-400">
            Gestellte Mahlzeiten antippen, um sie abzuziehen
            <HelpTip thema="abzuege" />
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">Verpflegungsmehraufwand pro Tag</caption>
            <thead>
              <tr className="text-left text-xs text-grey-600 dark:text-grey-400">
                <th scope="col" className="px-lg py-xs font-medium">
                  Tag
                </th>
                <th scope="col" className="px-sm py-xs font-medium">
                  Gestellte Mahlzeiten
                </th>
                <th scope="col" className="px-lg py-xs text-right font-medium">
                  Betrag
                </th>
              </tr>
            </thead>
            <tbody>
              {tage.map((t) => {
                const abz = state.verpflegungAbzuege.find((a) => a.datum === t.datum);
                return (
                  <tr key={t.datum} className="border-t border-grey-100 dark:border-grey-800">
                    <th scope="row" className="px-lg py-sm text-left font-normal">
                      <span className="block font-medium">{formatTag(t.datum)}</span>
                      <span className="text-xs text-grey-600 dark:text-grey-400">
                        {TYP_LABEL[t.typ]} · {eur(t.basis)}
                      </span>
                    </th>
                    <td className="px-sm py-sm">
                      <div className="flex flex-wrap gap-xs">
                        {MAHLZEITEN.map((m) => (
                          <MealChip
                            key={m.key}
                            emoji={m.emoji}
                            label={m.label}
                            active={abz?.[m.key] ?? false}
                            onClick={() => toggle(t.datum, m.key)}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-lg py-sm text-right tabular-nums">
                      {eur(t.summe)}
                      {t.abzug > 0 && (
                        <span className="block text-xs text-grey-600 dark:text-grey-400">
                          −{eur(t.abzug)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </FormSection>
  );
}
