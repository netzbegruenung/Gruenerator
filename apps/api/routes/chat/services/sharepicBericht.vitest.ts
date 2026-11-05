import { type SharepicBerichtEintrag } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { berichtFuerKi } from './sharepicBericht.js';

describe('berichtFuerKi', () => {
  it('writes one prefixed line per entry', () => {
    const text = berichtFuerKi([
      { art: 'fehlt', fakt: 'termin' },
      { art: 'repariert', feld: 'datum.time', wert: '18 Uhr' },
      { art: 'foto', id: 'upload:1', status: 'freigestellt' },
    ]);
    expect(text.split('\n')).toEqual([
      'Beim Erstellen: Termin fehlte im Auftrag und wurde weggelassen.',
      'Beim Erstellen: datum.time "18 Uhr" entfernt (stand nicht im Auftrag).',
      'Beim Erstellen: eigenes Foto upload:1 – freigestellt.',
    ]);
  });

  it('is empty for an empty report', () => {
    expect(berichtFuerKi([])).toBe('');
  });
});
