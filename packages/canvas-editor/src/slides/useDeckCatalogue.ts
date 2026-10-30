/**
 * Der Katalog der Deck-Vorlagen: was der Host liefert, mit „Offiziell" (CD)
 * immer dabei. Fehlt der Lader oder scheitert er, bleibt „Offiziell".
 */
import { type FolienVorlage } from '@gruenerator/contracts';
import { useEffect, useState } from 'react';

/** Der Stil des Grünen CD: gibt es immer, auch ohne Katalog des Hosts. */
export const OFFIZIELL: FolienVorlage = {
  id: 'offiziell',
  titel: 'Offiziell',
  beschreibung: 'Das Corporate Design der Grünen.',
  stil: 'cd',
  locale: 'de-DE',
};

export function useDeckCatalogue(load: (() => Promise<FolienVorlage[]>) | null): FolienVorlage[] {
  const [catalogue, setCatalogue] = useState<FolienVorlage[]>([OFFIZIELL]);

  useEffect(() => {
    if (!load) return;
    let live = true;
    load().then(
      (vorlagen) => {
        if (live && vorlagen.length > 0) {
          setCatalogue(vorlagen.some((v) => v.stil === 'cd') ? vorlagen : [OFFIZIELL, ...vorlagen]);
        }
      },
      (err: unknown) => {
        console.warn('[useDeckCatalogue] loading the deck Vorlagen failed', err);
      }
    );
    return () => {
      live = false;
    };
  }, [load]);

  return catalogue;
}
