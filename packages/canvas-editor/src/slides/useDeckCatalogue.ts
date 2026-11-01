/**
 * Der Katalog der Deck-Vorlagen: was der Host liefert, mit „Offiziell" (CD)
 * immer dabei. Fehlt der Lader oder scheitert er, bleibt „Offiziell".
 */
import { type FolienVorlage } from '@gruenerator/contracts';
import { useEffect, useMemo, useState } from 'react';

import type { BrandLocale } from '../brand/theme';

/**
 * Der Stil des Grünen CD: gibt es immer, auch ohne Katalog des Hosts. Die Id folgt der
 * eingebauten Rückfall-Vorlage des Servers (`sharepicVorlagen/catalog.ts`), damit beide
 * Seiten dieselbe Vorlage meinen.
 */
export const offiziellFor = (locale: BrandLocale): FolienVorlage => ({
  id: locale === 'de-AT' ? 'at-folien-offiziell' : 'de-folien-offiziell',
  titel: 'Offiziell',
  beschreibung: 'Corporate Design der Grünen',
  stil: 'cd',
  locale,
});

export function useDeckCatalogue(
  load: (() => Promise<FolienVorlage[]>) | null,
  locale: BrandLocale
): FolienVorlage[] {
  const [loaded, setLoaded] = useState<FolienVorlage[] | null>(null);
  const catalogue = useMemo(() => loaded ?? [offiziellFor(locale)], [loaded, locale]);

  useEffect(() => {
    if (!load) return;
    let live = true;
    load().then(
      (vorlagen) => {
        if (live && vorlagen.length > 0) {
          setLoaded(
            vorlagen.some((v) => v.stil === 'cd') ? vorlagen : [offiziellFor(locale), ...vorlagen]
          );
        }
      },
      (err: unknown) => {
        console.warn('[useDeckCatalogue] loading the deck Vorlagen failed', err);
      }
    );
    return () => {
      live = false;
    };
  }, [load, locale]);

  return catalogue;
}
