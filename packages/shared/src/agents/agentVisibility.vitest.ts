import { describe, expect, it } from 'vitest';

import { getCuratableSystemAgents } from './audience.js';
import { isAdminVisibleAgent } from './agentVisibility.js';
import { getHubMemberAgentIds } from './landesverbandHubs.js';

describe('isAdminVisibleAgent', () => {
  it('zeigt alles, solange nichts ausgeblendet ist', () => {
    expect(isAdminVisibleAgent('gruenerator-antrag', [])).toBe(true);
  });

  it('blendet genau den benannten Agenten aus', () => {
    const hidden = ['gruenerator-antrag'];
    expect(isAdminVisibleAgent('gruenerator-antrag', hidden)).toBe(false);
    expect(isAdminVisibleAgent('gruenerator-universal', hidden)).toBe(true);
  });
});

/**
 * Was der Admin einzeln schalten kann. Zwei Auslassungen, beide gewollt:
 * die Landesverbands-Spezialisten (die fallen mit ihrem Landesverband) und
 * alles, was die Instanz ohnehin nicht führt.
 */
describe('getCuratableSystemAgents', () => {
  it('lässt die Landesverbands-Spezialisten weg', () => {
    const hubMembers = getHubMemberAgentIds();
    const curatable = getCuratableSystemAgents('production').map((a) => a.identifier);

    expect(curatable.length).toBeGreaterThan(0);
    expect(curatable.filter((id) => hubMembers.has(id))).toEqual([]);
  });

  // Ohne Locale-Filter: wer den Katalog der Instanz pflegt, soll sehen, was sie
  // führt — nicht, was die eigene Spracheinstellung gerade zeigt.
  it('filtert nicht nach Locale', () => {
    const curatable = getCuratableSystemAgents('production');
    const audiences = new Set(curatable.map((a) => a.audience ?? 'all'));

    expect(audiences.size).toBeGreaterThan(1);
  });

  // Die zwölf allgemeinen Agenten hängen an keinem Landesverband, stehen also
  // auf jeder Instanz — auch auf einer, die alle Landesverbände ausblendet.
  it('bleibt auf einer Instanz ohne Landesverbände vollständig', () => {
    const onProduction = getCuratableSystemAgents('production').map((a) => a.identifier);
    const onBgst = getCuratableSystemAgents('bgst').map((a) => a.identifier);

    expect(onBgst).toContain('gruenerator-antrag');
    expect(onBgst).toEqual(onProduction);
  });
});
