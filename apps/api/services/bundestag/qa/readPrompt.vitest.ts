import { describe, expect, it } from 'vitest';

import { readSystem } from './readPrompt.js';

describe('readSystem', () => {
  // Live 28.10.2026: zu „Rente mit 70" fielen Drucksachen zur Regelaltersgrenze
  // und zur Kopplung an die Lebenserwartung als „ohne Treffer" durch.
  it('wertet Inhalte nach der Sache, nicht nach dem Wortlaut der Frage', () => {
    for (const auftrag of ['frage', 'zusammenfassung'] as const) {
      const system = readSystem(auftrag);
      expect(system).toMatch(/anderen Worten/);
      expect(system).toContain('Regelaltersgrenze');
      expect(system).toMatch(/wörtlich/);
    }
  });
});
