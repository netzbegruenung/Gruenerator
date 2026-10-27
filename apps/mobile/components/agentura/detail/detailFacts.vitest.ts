import { describe, expect, it } from 'vitest';

import {
  agentKnowledge,
  agentShareUrl,
  agentToolLabels,
  exampleCountLabel,
  recipeLibraryRef,
  recipeOriginLine,
} from './detailFacts';

describe('agentToolLabels', () => {
  it('beschriftet bekannte Werkzeuge, lässt unbekannte roh und entfernt Doppelte', () => {
    expect(
      agentToolLabels({
        identifier: 'x',
        enabledTools: ['search', 'zauberei'],
        plugins: ['search'],
      })
    ).toEqual(['Grünerator-Wissen', 'zauberei']);
  });
});

describe('agentKnowledge', () => {
  it('sammelt Notebooks und Sammlungen', () => {
    expect(
      agentKnowledge({
        identifier: 'x',
        defaultNotebookIds: ['nb'],
        toolRestrictions: { defaultCollection: 'a', allowedCollections: ['b'] },
      })
    ).toEqual(['nb', 'a', 'b']);
  });
});

describe('agentShareUrl', () => {
  it('nimmt für Nutzer-Agents die uuid, nicht den Identifier', () => {
    expect(agentShareUrl({ id: 'uuid-1', identifier: 'mein-agent' })).toBe(
      'https://gruenerator.eu/agentura/agent/uuid-1'
    );
  });
});

describe('recipeOriginLine', () => {
  it('nennt Projekt und Person bei geteilten, Person bei öffentlichen Zeilen', () => {
    expect(recipeOriginLine({ sharedFromGroup: 'KV Ort', ownerName: 'Ada' }, 'shared')).toBe(
      'Geteilt aus KV Ort von Ada'
    );
    expect(recipeOriginLine({ sharedFromGroup: null, ownerName: null }, 'public')).toBe(
      'Öffentlich'
    );
    expect(recipeOriginLine({ sharedFromGroup: null, ownerName: 'Ada' }, 'own')).toBeNull();
  });
});

describe('recipeLibraryRef', () => {
  it('Mention für Katalog, Zeilen-ID für fremde, nichts für eigene', () => {
    expect(recipeLibraryRef('system', 'presse', null)).toBe('presse');
    expect(recipeLibraryRef('public', 'x', 'row-1')).toBe('row-1');
    expect(recipeLibraryRef('own', 'x', 'row-1')).toBeNull();
  });
});

describe('exampleCountLabel', () => {
  it('unterscheidet Einzahl und Mehrzahl', () => {
    expect(exampleCountLabel(1)).toBe('1 Beispiel hinterlegt');
    expect(exampleCountLabel(0)).toBe('0 Beispiele hinterlegt');
  });
});
