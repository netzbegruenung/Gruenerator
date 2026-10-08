import { BELEG_KATEGORIEN, postenOf, type BelegPosten } from '@gruenerator/shared/reisekosten';
import { PiPaperclip } from 'react-icons/pi';

import { eur } from '../utils/format';

import type { BelegMeta } from '@gruenerator/contracts';

/** The belege sorted onto one form line, shown inline next to its inputs. */
export function BelegChips({ belege, posten }: { belege: BelegMeta[]; posten: BelegPosten }) {
  const own = belege.filter((b) => postenOf(b) === posten);
  if (own.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-xs p-0" aria-label="Zugeordnete Belege">
      {own.map((b) => (
        <li
          key={b.id}
          className="inline-flex items-center gap-xxs rounded-full bg-primary-50 px-sm py-xxs text-xs text-primary-800 dark:bg-primary-950 dark:text-primary-100"
        >
          <PiPaperclip aria-hidden className="size-3.5" />
          {BELEG_KATEGORIEN[b.kategorie].label}
          {b.betrag != null && BELEG_KATEGORIEN[b.kategorie].traegtBetrag && ` · ${eur(b.betrag)}`}
        </li>
      ))}
    </ul>
  );
}
