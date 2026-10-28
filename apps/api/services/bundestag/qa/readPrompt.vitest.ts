import { describe, expect, it } from 'vitest';

import { readPrompt, readSystem } from './readPrompt.js';

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

describe('Fokus im Prompt', () => {
  const header = { ref: '21/1', typ: 'Gesetzentwurf', datum: 'd', urheber: [], teil: 1, teile: 2 };
  it('ohne Fokus unverändert', () => {
    expect(readSystem('frage')).toBe(readSystem('frage', null));
    expect(readPrompt('q', 'frage', header, 'w')).not.toContain('Fokus');
  });
  it('mit Fokus steht er im System- und im Nutzerprompt', () => {
    expect(readSystem('frage', '§ 14')).toContain('Konzentriere dich auf „§ 14“');
    expect(readPrompt('q', 'frage', header, 'w', '§ 14')).toContain('Fokus: § 14');
  });
});
